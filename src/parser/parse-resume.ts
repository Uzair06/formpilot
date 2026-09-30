import { toAiJsonSchema } from '@/src/ai/json-schema';
import { RESUME_SYSTEM_PROMPT, buildResumePrompt } from '@/src/ai/prompts/resume';
import { AiError, type AiProvider } from '@/src/ai/provider';
import { ResumeProfileSchema, type ResumeProfile } from '@/src/profile/resume';
import { verifyAgainstSource } from './verify-profile';

const MAX_ATTEMPTS = 2; // the first try, plus one retry if the answer is unusable

let cachedSchema: object | undefined;
const resumeJsonSchema = () => (cachedSchema ??= toAiJsonSchema(ResumeProfileSchema));

/** Resume text → AI → checked ResumeProfile. Throws AiError. */
export async function parseResumeWithAi(
  provider: AiProvider,
  input: { text: string; links: string[] },
): Promise<ResumeProfile> {
  const request = {
    system: RESUME_SYSTEM_PROMPT,
    prompt: buildResumePrompt(input.text, input.links),
    schema: resumeJsonSchema(),
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await provider.generateJson(request);
    } catch (error) {
      // Only a bad answer is worth retrying; a wrong key or no internet won't fix itself.
      if (error instanceof AiError && error.code === 'invalid_output') continue;
      throw error;
    }

    const parsed = ResumeProfileSchema.safeParse(raw);
    if (parsed.success) return verifyAgainstSource(parsed.data, input.text, input.links);
    // Log where the answer was wrong, not what it said (it contains personal data).
    console.warn(`[FormPilot] AI resume answer failed validation (attempt ${attempt})`, parsed.error.issues.map((i) => i.path.join('.')));
  }
  throw new AiError('invalid_output');
}
