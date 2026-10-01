// What the Mapper decides for each field.

export type DecisionSource = 'rule' | 'answers' | 'ai' | 'prefilled' | 'policy';

export type DecisionStatus =
  | 'fill' // confident: fill it
  | 'suggest' // AI is only fairly sure: show to the user, don't fill
  | 'skip' // nothing to put here (or already filled)
  | 'flag'; // the user must handle it (consent box, missing answer, sensitive)

export interface FieldDecision {
  fieldId: string;
  label: string;
  value: string | string[] | null; // string[] for multi-pick search boxes (e.g. skills)
  source: DecisionSource;
  confidence: number; // 0..1
  reason: string;
  status: DecisionStatus;
}

/** Confidence needed to fill an AI answer without asking; between SUGGEST and FILL it is shown as a suggestion. */
export const FILL_THRESHOLD = 0.75;
export const SUGGEST_THRESHOLD = 0.5;
