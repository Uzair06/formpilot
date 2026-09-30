// The adapter shape every AI provider (Gemini now, maybe OpenAI/Anthropic later) must fit.
// The rest of the code only talks to this, so swapping providers touches one file.

export interface JsonRequest {
  system: string; // standing rules for the model
  prompt: string; // this request's input
  schema: object; // JSON Schema the answer must follow
}

export interface AiProvider {
  readonly name: string;
  /** Returns the model's answer parsed from JSON. It is NOT checked against the schema yet. */
  generateJson(request: JsonRequest): Promise<unknown>;
}

export type AiErrorCode =
  | 'no_api_key'
  | 'invalid_api_key'
  | 'model_not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'network'
  | 'blocked'
  | 'invalid_output'
  | 'request_failed';

const MESSAGES: Record<AiErrorCode, string> = {
  no_api_key: 'Add your Gemini API key in Settings first.',
  invalid_api_key: 'Gemini did not accept your API key. Please check it in Settings.',
  model_not_found: 'The chosen Gemini model is not available to your key. Please pick another model in Settings.',
  rate_limited: 'Gemini says too many requests right now (or your quota is used up). Please wait a minute and try again.',
  unavailable: 'Gemini is busy or down right now. Please try again in a moment.',
  timeout: 'Gemini took too long to answer. Please try again.',
  network: 'Could not reach Gemini. Please check your internet connection.',
  blocked: 'Gemini refused to answer this request.',
  invalid_output: 'Gemini gave an answer we could not use. Please try again.',
  request_failed: 'The request to Gemini failed. Please try again.',
};

export class AiError extends Error {
  /**
   * @param detail the provider's own short explanation (e.g. "HTTP 503 — UNAVAILABLE: model is overloaded"),
   *   shown in small print for troubleshooting. Never contains resume data.
   */
  constructor(
    readonly code: AiErrorCode,
    readonly detail?: string,
  ) {
    super(MESSAGES[code]);
    this.name = 'AiError';
  }
}
