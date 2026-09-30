import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GEMINI_MODEL } from '@/src/ai/gemini';
import { AiError, type AiProvider } from '@/src/ai/provider';
import { handleBackgroundMessage, type HandlerDeps } from '@/src/messaging/background-handler';
import { geminiApiKey, geminiModel } from '@/src/shared/settings';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ALEX_RIVERA_EXPECTED } from '../../fixtures/resumes/alex-rivera.expected';

const PARSE_REQUEST = {
  type: 'parseResume',
  text: 'Alex J. Rivera · +1 (555) 010-0142 · alex.rivera@example.com',
  links: ['https://www.linkedin.com/in/alex-rivera-example', 'https://github.com/alex-rivera-example', 'https://alexrivera.example.com'],
};

const MODELS = [{ id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', description: '' }];

describe('handleBackgroundMessage', () => {
  const provider: AiProvider = { name: 'fake', generateJson: async () => ALEX_RIVERA_EXPECTED };
  const deps = {
    createProvider: vi.fn((_key: string, _model: string) => provider),
    listModels: vi.fn(async (_key: string) => MODELS),
  } satisfies HandlerDeps;

  beforeEach(() => {
    fakeBrowser.reset();
    deps.createProvider.mockClear();
    deps.listModels.mockClear();
  });

  it('rejects messages it does not understand', async () => {
    for (const message of [null, 'hello', { type: 'deleteEverything' }, { type: 'parseResume', text: '' }]) {
      const result = await handleBackgroundMessage(message, deps);
      expect(result).toMatchObject({ ok: false, error: { code: 'bad_request' } });
    }
    expect(deps.createProvider).not.toHaveBeenCalled();
  });

  it('asks for an API key when none is saved', async () => {
    for (const message of [PARSE_REQUEST, { type: 'listModels' }]) {
      const result = await handleBackgroundMessage(message, deps);
      expect(result).toMatchObject({ ok: false, error: { code: 'no_api_key' } });
    }
    expect(deps.createProvider).not.toHaveBeenCalled();
    expect(deps.listModels).not.toHaveBeenCalled();
  });

  it('parses the resume with the saved key and the default model', async () => {
    await geminiApiKey.setValue('saved-key');
    const result = await handleBackgroundMessage(PARSE_REQUEST, deps);
    expect(deps.createProvider).toHaveBeenCalledWith('saved-key', DEFAULT_GEMINI_MODEL);
    expect(result).toEqual({ ok: true, data: ALEX_RIVERA_EXPECTED });
  });

  it('uses the model chosen in Settings', async () => {
    await geminiApiKey.setValue('saved-key');
    await geminiModel.setValue('gemini-3.5-flash-lite');
    await handleBackgroundMessage(PARSE_REQUEST, deps);
    expect(deps.createProvider).toHaveBeenCalledWith('saved-key', 'gemini-3.5-flash-lite');
  });

  it('lists models with the saved key', async () => {
    await geminiApiKey.setValue('saved-key');
    expect(await handleBackgroundMessage({ type: 'listModels' }, deps)).toEqual({ ok: true, data: MODELS });
    expect(deps.listModels).toHaveBeenCalledWith('saved-key');
  });

  it('passes on the provider’s error detail', async () => {
    await geminiApiKey.setValue('saved-key');
    const failing = { ...deps, listModels: async () => Promise.reject(new AiError('unavailable', 'HTTP 503 — overloaded')) };
    expect(await handleBackgroundMessage({ type: 'listModels' }, failing)).toEqual({
      ok: false,
      error: { code: 'unavailable', message: new AiError('unavailable').message, detail: 'HTTP 503 — overloaded' },
    });
  });

  it('turns unexpected crashes into a safe error answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await geminiApiKey.setValue('saved-key');
    const broken: AiProvider = {
      name: 'broken',
      generateJson: async () => {
        throw new RangeError('boom');
      },
    };
    const result = await handleBackgroundMessage(PARSE_REQUEST, { ...deps, createProvider: () => broken });
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } });
  });
});
