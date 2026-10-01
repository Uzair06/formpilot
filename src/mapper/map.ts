import type { AiFieldAnswer } from '@/src/ai/prompts/mapping';
import type { AnswersProfile } from '@/src/profile/answers';
import type { ResumeProfile } from '@/src/profile/resume';
import type { FieldDescriptor } from '@/src/scanner/types';
import { matchOption, normalize } from '@/src/shared/match-option';
import { DECLINE_PATTERN, ruleFor, type RuleResult } from './rules';
import { FILL_THRESHOLD, SUGGEST_THRESHOLD, type FieldDecision } from './types';

// Decides a value for every field on a page: rules first, one AI call for the rest, then policy checks.

/** Questions we never send to the AI and never answer automatically. */
const SENSITIVE_PATTERN = /date of birth|birth ?date|social security|\bssn\b|national id|passport number|criminal|convicted|felony|religio|sexual orientation|signature|sign here/;

export type AskAi = (fields: FieldDescriptor[]) => Promise<AiFieldAnswer[]>;

export async function mapFields(
  fields: FieldDescriptor[],
  profile: ResumeProfile,
  answers: AnswersProfile,
  askAi: AskAi,
): Promise<FieldDecision[]> {
  const decisions = new Map<string, FieldDecision>();
  const forAi: FieldDescriptor[] = [];
  const decide = (field: FieldDescriptor, d: Omit<FieldDecision, 'fieldId' | 'label'>) =>
    decisions.set(field.id, { fieldId: field.id, label: field.label, ...d });

  for (const field of fields) {
    // Hard Rule 10: keep values that are already there (e.g. Workday's own autofill).
    if (field.currentValue && field.type !== 'checkbox') {
      decide(field, { value: field.currentValue, source: 'prefilled', confidence: 1, reason: 'Already filled on the page — kept', status: 'skip' });
      continue;
    }
    const rule = ruleFor(field, profile, answers);
    if (rule) {
      const { needsAi, ...decision } = withRealOption(field, rule);
      if (needsAi) forAi.push(field);
      else decide(field, decision);
      continue;
    }
    if (SENSITIVE_PATTERN.test(normalize(field.label))) {
      decide(field, { value: null, source: 'policy', confidence: 0, reason: 'Sensitive question: please answer it yourself', status: 'flag' });
      continue;
    }
    forAi.push(field);
  }

  if (forAi.length > 0) {
    let aiAnswers: AiFieldAnswer[] = [];
    let aiError = '';
    try {
      aiAnswers = await askAi(forAi);
    } catch (error) {
      aiError = error instanceof Error ? error.message : 'AI unavailable';
    }
    for (const field of forAi) {
      const answer = aiAnswers.find((a) => a.id === field.id);
      decide(field, fromAi(field, answer, aiError));
    }
  }

  return fields.map((field) => decisions.get(field.id)!);
}

// Other ways forms word our EEO choices.
const ALTERNATIVE_WORDINGS: Record<string, string[]> = {
  'I am not a veteran': ['I am not a protected veteran', 'Not a veteran', 'No'],
  'I am a protected veteran': ['I identify as one or more of the classifications of protected veteran', 'Yes'],
  'I am a veteran, but not a protected veteran': ['I am not a protected veteran'],
  'Two or more races': ['Two or More Races (Not Hispanic or Latino)'],
  'Yes, I have a disability (or had one in the past)': ['Yes, I have a disability', 'Yes'],
  'No, I do not have a disability': ['No, I do not have a disability and have not had one in the past', 'No'],
};

/** Rule answers for choice fields must be one of the real options (Hard Rule 6). */
function withRealOption(field: FieldDescriptor, rule: RuleResult): Omit<FieldDecision, 'fieldId' | 'label'> & { needsAi?: boolean } {
  const base = { ...rule, confidence: rule.confidence ?? 1 };
  if (rule.status !== 'fill' || typeof rule.value !== 'string' || field.options.length === 0) return base;
  if (!['select', 'radio'].includes(field.type)) return base;

  const wanted = rule.value;
  const option =
    wanted === 'decline'
      ? field.options.find((o) => DECLINE_PATTERN.test(normalize(o))) ?? null
      : [wanted, ...(ALTERNATIVE_WORDINGS[wanted] ?? [])].map((w) => matchOption(w, field.options)).find(Boolean) ?? null;
  if (option) return { ...base, value: option };
  // A profile value in different words (e.g. "CA" for "California", "M.S." for "Master's Degree"):
  // let the AI pick the matching option. Never for Answers-tab or EEO values, which are the user's own words.
  if (rule.source === 'rule') return { ...base, value: null, status: 'skip', reason: `${rule.reason}: "${wanted}" needs matching`, needsAi: true };
  return { ...base, value: null, status: 'flag', reason: `${rule.reason} — "${wanted}" is not one of the choices` };
}

function fromAi(field: FieldDescriptor, answer: AiFieldAnswer | undefined, aiError: string): Omit<FieldDecision, 'fieldId' | 'label'> {
  if (!answer) {
    return { value: null, source: 'ai', confidence: 0, reason: aiError ? `AI unavailable: ${aiError}` : 'AI gave no answer', status: 'skip' };
  }
  if (answer.value === null || !answer.value.trim()) {
    return { value: null, source: 'ai', confidence: answer.confidence, reason: answer.reason || 'Not enough information', status: field.required ? 'flag' : 'skip' };
  }
  let value = answer.value;
  if (['select', 'radio'].includes(field.type) && field.options.length > 0) {
    const option = matchOption(value, field.options);
    if (!option) {
      return { value: null, source: 'ai', confidence: 0, reason: `AI answer "${value}" is not one of the choices`, status: field.required ? 'flag' : 'skip' };
    }
    value = option;
  }
  const status = answer.confidence >= FILL_THRESHOLD ? 'fill' : answer.confidence >= SUGGEST_THRESHOLD ? 'suggest' : 'skip';
  return { value, source: 'ai', confidence: answer.confidence, reason: answer.reason, status };
}
