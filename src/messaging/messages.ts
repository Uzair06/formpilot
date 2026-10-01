import { z } from 'zod';
import type { GeminiModelInfo } from '@/src/ai/gemini';
import type { AiFieldAnswer } from '@/src/ai/prompts/mapping';
import type { AiErrorCode } from '@/src/ai/provider';
import type { ResumeProfile } from '@/src/profile/resume';

// Every message the background worker understands. Messages are checked with zod
// on arrival, because anything could be sent by mistake.

export const ParseResumeRequestSchema = z.object({
  type: z.literal('parseResume'),
  text: z.string().min(1).max(100_000),
  links: z.array(z.string().max(2_000)).max(100),
});

// Used by Settings: which models can the saved key use? (Also proves the key works.)
export const ListModelsRequestSchema = z.object({ type: z.literal('listModels') });

// Used by the content script: ask the AI for values of fields the rules couldn't handle.
// The background loads the profile and answers itself; only field descriptions travel here.
export const MapFieldsRequestSchema = z.object({
  type: z.literal('mapFields'),
  fields: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        helperText: z.string(),
        section: z.string(),
        type: z.enum(['text', 'textarea', 'select', 'prompt', 'radio', 'checkbox', 'date', 'file']),
        required: z.boolean(),
        currentValue: z.string(),
        options: z.array(z.string()),
        automationId: z.string(),
      }),
    )
    .max(200),
});

// Used by the content script to upload the resume file (it can't open the extension's IndexedDB).
export const GetResumeFileRequestSchema = z.object({ type: z.literal('getResumeFile') });

export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  ParseResumeRequestSchema,
  ListModelsRequestSchema,
  MapFieldsRequestSchema,
  GetResumeFileRequestSchema,
]);

export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>;

/** What each request type answers with when it works. */
export interface BackgroundResponses {
  parseResume: ResumeProfile;
  listModels: GeminiModelInfo[];
  mapFields: AiFieldAnswer[];
  getResumeFile: { name: string; mimeType: string; base64: string } | null;
}

export type ErrorCode = AiErrorCode | 'bad_request' | 'internal';

/** Every answer is either { ok: true, data } or { ok: false, error } — never a thrown error. */
export interface ErrorInfo {
  code: ErrorCode;
  message: string; // friendly text for the user
  detail?: string; // the provider's own words, shown small, for troubleshooting
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export type ResponseFor<R extends BackgroundRequest> = Result<BackgroundResponses[R['type']]>;

/** Used by the side panel (and later the content script) to ask the background worker for something. */
export async function sendToBackground<R extends BackgroundRequest>(request: R): Promise<ResponseFor<R>> {
  try {
    return (await browser.runtime.sendMessage(request)) as ResponseFor<R>;
  } catch {
    return { ok: false, error: { code: 'internal', message: 'FormPilot could not reach its background worker. Please try again.' } };
  }
}
