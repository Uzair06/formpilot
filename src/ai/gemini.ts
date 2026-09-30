import { AiError, type AiProvider, type JsonRequest } from './provider';

// Google's alias for its newest Flash model. It moves forward on its own when Google
// releases a new one (Google emails 2 weeks before a breaking change), so no model name
// is hardcoded. The user can pick a specific model in Settings instead.
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 90_000;

// Google's advice for 500/503/504: wait and retry with growing gaps (exponential backoff).
const RETRY_DELAYS_MS = [1_000, 3_000];
const RETRYABLE_STATUSES = new Set([500, 503, 504]);

interface GeminiOptions {
  model?: string;
  fetchFn?: typeof fetch; // swapped for a fake in tests
  timeoutMs?: number;
  retryDelaysMs?: number[];
  wait?: (ms: number) => Promise<void>; // swapped in tests so they don't really wait
}

// Only the parts of Gemini's response we read.
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Gemini behind our AiProvider adapter. Must only be created in the background service worker. */
export function createGeminiProvider(apiKey: string, options: GeminiOptions = {}): AiProvider {
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const fetchFn = options.fetchFn ?? fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  const wait = options.wait ?? sleep;

  return {
    name: `gemini:${model}`,

    async generateJson({ system, prompt, schema }: JsonRequest): Promise<unknown> {
      const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // JSON mode: the model must answer with JSON matching `schema`.
        // Temperature is left at its default on purpose: Google advises against lowering it for Gemini 3.
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
      });

      let response: Response;
      for (let attempt = 0; ; attempt++) {
        response = await send(fetchFn, url, apiKey, timeoutMs, { method: 'POST', body });
        const delay = retryDelaysMs[attempt];
        if (response.ok || !RETRYABLE_STATUSES.has(response.status) || delay === undefined) break;
        console.warn(`[FormPilot] Gemini returned ${response.status}; retrying in ${delay} ms`);
        await wait(delay);
      }
      if (!response.ok) throw await errorFromResponse(response);

      const data = (await response.json()) as GeminiResponse;
      if (data.promptFeedback?.blockReason) throw new AiError('blocked', data.promptFeedback.blockReason);

      const candidate = data.candidates?.[0];
      // Skip "thought" parts (the model's private reasoning); keep only the answer.
      const text = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('');

      if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason) && !text) {
        throw new AiError('blocked', candidate.finishReason); // e.g. SAFETY, RECITATION
      }
      try {
        return JSON.parse(text);
      } catch {
        // Also covers MAX_TOKENS, where the JSON is cut off halfway.
        console.warn('[FormPilot] Gemini returned non-JSON output', { finishReason: candidate?.finishReason });
        throw new AiError('invalid_output', candidate?.finishReason);
      }
    },
  };
}

export interface GeminiModelInfo {
  id: string; // what goes in the request URL, e.g. "gemini-flash-latest"
  displayName: string;
  description: string;
}

// Models that can't do plain text-in / JSON-out (speech, images, live audio, embeddings…).
// Matched loosely on purpose so new variants are hidden without code changes.
const NOT_FOR_TEXT = /(tts|image|imagen|live|embed|transcribe|audio|veo|robotics|computer-use|aqa)/i;

/** Asks Google which models this API key can use for text generation. */
export async function listGeminiModels(apiKey: string, fetchFn: typeof fetch = fetch.bind(globalThis)): Promise<GeminiModelInfo[]> {
  const response = await send(fetchFn, `${API_BASE}/models?pageSize=1000`, apiKey, 30_000, { method: 'GET' });
  if (!response.ok) throw await errorFromResponse(response);

  const data = (await response.json()) as {
    models?: Array<{ name?: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }>;
  };
  return (data.models ?? [])
    .filter((m) => m.name?.startsWith('models/gemini') && m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name!.slice('models/'.length), displayName: m.displayName ?? '', description: m.description ?? '' }))
    .filter((m) => !NOT_FOR_TEXT.test(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function send(fetchFn: typeof fetch, url: string, apiKey: string, timeoutMs: number, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, {
      ...init,
      // The key goes in a header, not the URL, so it never shows up in logs or history.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new AiError(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network');
  }
}

async function errorFromResponse(response: Response): Promise<AiError> {
  // Google's error body says what went wrong (e.g. "API_KEY_INVALID", "model is overloaded").
  // It describes the request, not our input text, so it is safe to log and show.
  const raw = await response.text().catch(() => '');
  let summary = raw.slice(0, 200);
  try {
    const { error } = JSON.parse(raw) as { error?: { status?: string; message?: string } };
    if (error) summary = [error.status, error.message].filter(Boolean).join(': ').slice(0, 200);
  } catch {
    // not JSON; keep the raw start
  }
  const detail = `HTTP ${response.status}${summary ? ` — ${summary}` : ''}`;
  console.warn('[FormPilot] Gemini request failed', detail);

  if (response.status === 401 || response.status === 403 || raw.includes('API_KEY_INVALID')) {
    return new AiError('invalid_api_key', detail);
  }
  if (response.status === 404) return new AiError('model_not_found', detail);
  if (response.status === 429) return new AiError('rate_limited', detail);
  if (response.status >= 500) return new AiError('unavailable', detail);
  return new AiError('request_failed', detail);
}
