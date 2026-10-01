import { createGeminiProvider, listGeminiModels, type GeminiModelInfo } from '@/src/ai/gemini';
import { toAiJsonSchema } from '@/src/ai/json-schema';
import { AiFieldAnswersSchema, buildMappingPrompt, MAPPING_SYSTEM_PROMPT } from '@/src/ai/prompts/mapping';
import { loadResumeFile } from '@/src/profile/resume-file';
import { loadAnswersProfile, loadResumeProfile } from '@/src/profile/storage';
import { AiError, type AiProvider } from '@/src/ai/provider';
import { parseResumeWithAi } from '@/src/parser/parse-resume';
import { geminiApiKey, geminiModel } from '@/src/shared/settings';
import { BackgroundRequestSchema, type Result } from './messages';

export interface HandlerDeps {
  createProvider: (apiKey: string, model: string) => AiProvider;
  listModels: (apiKey: string) => Promise<GeminiModelInfo[]>;
}

const defaultDeps: HandlerDeps = {
  createProvider: (apiKey, model) => createGeminiProvider(apiKey, { model }),
  listModels: (apiKey) => listGeminiModels(apiKey),
};

async function requireApiKey(): Promise<string> {
  const apiKey = await geminiApiKey.getValue();
  if (!apiKey) throw new AiError('no_api_key');
  return apiKey;
}

/** Checks an incoming message, does the work, and always answers with a Result (never throws). */
export async function handleBackgroundMessage(message: unknown, deps: HandlerDeps = defaultDeps): Promise<Result<unknown>> {
  const request = BackgroundRequestSchema.safeParse(message);
  if (!request.success) {
    return { ok: false, error: { code: 'bad_request', message: 'FormPilot sent itself a message it does not understand.' } };
  }

  try {
    switch (request.data.type) {
      case 'parseResume': {
        const provider = deps.createProvider(await requireApiKey(), await geminiModel.getValue());
        return { ok: true, data: await parseResumeWithAi(provider, request.data) };
      }
      case 'listModels':
        return { ok: true, data: await deps.listModels(await requireApiKey()) };
      case 'mapFields': {
        const profile = await loadResumeProfile();
        if (!profile) return { ok: false, error: { code: 'bad_request', message: 'Upload your resume first.' } };
        const provider = deps.createProvider(await requireApiKey(), await geminiModel.getValue());
        const raw = await provider.generateJson({
          system: MAPPING_SYSTEM_PROMPT,
          prompt: buildMappingPrompt(request.data.fields, profile, await loadAnswersProfile()),
          schema: toAiJsonSchema(AiFieldAnswersSchema),
        });
        const parsed = AiFieldAnswersSchema.safeParse(raw);
        if (!parsed.success) throw new AiError('invalid_output');
        return { ok: true, data: parsed.data.answers };
      }
      case 'getResumeFile': {
        const file = await loadResumeFile();
        if (!file) return { ok: true, data: null };
        return { ok: true, data: { name: file.name, mimeType: file.mimeType, base64: toBase64(file.bytes) } };
      }
    }
  } catch (error) {
    if (error instanceof AiError) {
      return { ok: false, error: { code: error.code, message: error.message, detail: error.detail } };
    }
    console.error('[FormPilot] background handler failed', error instanceof Error ? error.name : 'unknown error');
    return { ok: false, error: { code: 'internal', message: 'Something went wrong inside FormPilot. Please try again.' } };
  }
}

// Messages must be JSON, so the file travels as base64 text.
function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}
