import { storage } from 'wxt/utils/storage';
import type { z } from 'zod';
import { AnswersProfileSchema, defaultAnswersProfile, type AnswersProfile } from './answers';
import { ResumeProfileSchema, type ResumeProfile } from './resume';

// Both profiles live in chrome.storage.local: kept on this computer, survives restarts.
// Items are stored as unknown because anything read back is checked with zod first.
const resumeItem = storage.defineItem<unknown>('local:resumeProfile', { fallback: null });
const answersItem = storage.defineItem<unknown>('local:answersProfile', { fallback: null });

// Check stored data against its schema. Bad data is dropped instead of crashing the UI.
// Only the paths of the problems are logged, never the values (no personal data in logs).
function parseStored<T>(schema: z.ZodType<T>, raw: unknown, name: string): T | null {
  if (raw === null) return null;
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const paths = result.error.issues.map((issue) => issue.path.join('.') || '(root)');
  console.warn(`[FormPilot] ignoring invalid saved ${name}`, paths);
  return null;
}

/** The saved resume profile, or null if none has been saved yet. */
export async function loadResumeProfile(): Promise<ResumeProfile | null> {
  return parseStored(ResumeProfileSchema, await resumeItem.getValue(), 'resume profile');
}

/** Validates, then saves. Throws if the profile does not match the schema. */
export async function saveResumeProfile(profile: ResumeProfile): Promise<void> {
  await resumeItem.setValue(ResumeProfileSchema.parse(profile));
}

export async function clearResumeProfile(): Promise<void> {
  await resumeItem.removeValue();
}

/** The saved answers, or the defaults (EEO = decline, yes/no = unanswered) if none saved. */
export async function loadAnswersProfile(): Promise<AnswersProfile> {
  const saved = parseStored(AnswersProfileSchema, await answersItem.getValue(), 'answers profile');
  return saved ?? defaultAnswersProfile();
}

/** Validates, then saves. Throws if the answers do not match the schema. */
export async function saveAnswersProfile(answers: AnswersProfile): Promise<void> {
  await answersItem.setValue(AnswersProfileSchema.parse(answers));
}
