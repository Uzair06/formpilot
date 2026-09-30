import { createGeminiProvider, listGeminiModels, type GeminiModelInfo } from '@/src/ai/gemini';
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
    }
  } catch (error) {
    if (error instanceof AiError) {
      return { ok: false, error: { code: error.code, message: error.message, detail: error.detail } };
    }
    console.error('[FormPilot] background handler failed', error instanceof Error ? error.name : 'unknown error');
    return { ok: false, error: { code: 'internal', message: 'Something went wrong inside FormPilot. Please try again.' } };
  }
}
