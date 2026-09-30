import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiProvider, DEFAULT_GEMINI_MODEL, listGeminiModels } from '@/src/ai/gemini';
import { AiError } from '@/src/ai/provider';

const REQUEST = { system: 'rules', prompt: 'input', schema: { type: 'object' } };

function geminiReply(parts: Array<{ text?: string; thought?: boolean }>, finishReason = 'STOP') {
  return new Response(JSON.stringify({ candidates: [{ content: { parts }, finishReason }] }), { status: 200 });
}

function googleError(status: number, googleStatus: string, message: string) {
  return new Response(JSON.stringify({ error: { code: status, status: googleStatus, message } }), { status });
}

const noWait = vi.fn(async () => {});

function providerWith(fetchFn: typeof fetch, model?: string) {
  return createGeminiProvider('test-key', { fetchFn, model, wait: noWait });
}

async function caught(promise: Promise<unknown>): Promise<AiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AiError);
  return error as AiError;
}

describe('Gemini provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    noWait.mockClear();
  });

  it('sends a JSON-mode request with the key in a header', async () => {
    const fetchFn = vi.fn(async () => geminiReply([{ text: '{"ok":true}' }]));
    await providerWith(fetchFn).generateJson(REQUEST);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain('test-key'); // the key must not be in the URL
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'rules' }] },
      contents: [{ role: 'user', parts: [{ text: 'input' }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } },
    });
  });

  it('uses the chosen model instead of the default', async () => {
    const fetchFn = vi.fn(async () => geminiReply([{ text: '{}' }]));
    await providerWith(fetchFn, 'gemini-some-future-model').generateJson(REQUEST);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain('/models/gemini-some-future-model:generateContent');
  });

  it('returns the parsed JSON answer, skipping thought parts', async () => {
    const fetchFn = vi.fn(async () => geminiReply([{ text: 'thinking…', thought: true }, { text: '{"a":' }, { text: '1}' }]));
    expect(await providerWith(fetchFn).generateJson(REQUEST)).toEqual({ a: 1 });
  });

  it('waits and retries when Gemini is overloaded, with growing gaps', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(googleError(503, 'UNAVAILABLE', 'The model is overloaded.'))
      .mockResolvedValueOnce(googleError(500, 'INTERNAL', 'An internal error has occurred.'))
      .mockResolvedValueOnce(geminiReply([{ text: '{"ok":true}' }]));
    expect(await providerWith(fetchFn).generateJson(REQUEST)).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(noWait.mock.calls).toEqual([[1000], [3000]]);
  });

  it('gives up after the retries, keeping Google’s explanation', async () => {
    const fetchFn = vi.fn(async () => googleError(503, 'UNAVAILABLE', 'The model is overloaded.'));
    const error = await caught(providerWith(fetchFn).generateJson(REQUEST));
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(error.code).toBe('unavailable');
    expect(error.detail).toBe('HTTP 503 — UNAVAILABLE: The model is overloaded.');
  });

  it.each([
    [400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', 'invalid_api_key'],
    [403, '{}', 'invalid_api_key'],
    [404, '{"error":{"status":"NOT_FOUND","message":"models/x is not found"}}', 'model_not_found'],
    [429, '{}', 'rate_limited'],
    [400, '{"error":{"message":"bad schema"}}', 'request_failed'],
  ])('turns HTTP %i into %s without retrying', async (status, body, code) => {
    const fetchFn = vi.fn(async () => new Response(body, { status }));
    expect((await caught(providerWith(fetchFn).generateJson(REQUEST))).code).toBe(code);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reports blocked prompts and safety stops', async () => {
    const blocked = vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
    expect((await caught(providerWith(blocked).generateJson(REQUEST))).code).toBe('blocked');

    const safetyStop = vi.fn(async () => geminiReply([], 'SAFETY'));
    expect((await caught(providerWith(safetyStop).generateJson(REQUEST))).code).toBe('blocked');
  });

  it('reports cut-off or non-JSON answers as invalid output', async () => {
    const cutOff = vi.fn(async () => geminiReply([{ text: '{"a": [1, 2' }], 'MAX_TOKENS'));
    expect((await caught(providerWith(cutOff).generateJson(REQUEST))).code).toBe('invalid_output');
  });

  it('tells timeouts apart from network failures', async () => {
    const slow = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect((await caught(providerWith(slow).generateJson(REQUEST))).code).toBe('timeout');

    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect((await caught(providerWith(offline).generateJson(REQUEST))).code).toBe('network');
  });
});

describe('listGeminiModels', () => {
  it('lists text models the key can use, hiding speech/image/embedding ones', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            models: [
              { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.5-flash-lite', displayName: 'Lite', supportedGenerationMethods: ['generateContent', 'countTokens'] },
              { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
              { name: 'models/gemma-4-27b', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
        ),
    );
    const models = await listGeminiModels('test-key', fetchFn);

    expect(models.map((m) => m.id)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });

  it('reports a bad key', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn(async () => googleError(400, 'INVALID_ARGUMENT', 'API key not valid. API_KEY_INVALID'));
    expect((await caught(listGeminiModels('bad', fetchFn))).code).toBe('invalid_api_key');
  });
});
