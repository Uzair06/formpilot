import { z } from 'zod';

// Answers the user types in themselves. These are never guessed from the resume or by AI.
//
// Yes/no questions start as null = "not answered yet", so the Mapper can tell
// "user said no" apart from "user never said" and pause instead of guessing.
//
// EEO (voluntary self-identification) always starts as 'decline' (HARD RULE 3).
// The option lists here are our own; the Mapper matches them to the real Workday
// options later (to be checked against docs/recon/ in M7).

const yesNo = () => z.enum(['yes', 'no']).nullable().default(null);

export const DECLINE = 'decline';

export const GenderSchema = z.enum(['male', 'female', 'non_binary', DECLINE]);

export const EthnicitySchema = z.enum([
  'hispanic_latino',
  'white',
  'black_african_american',
  'asian',
  'american_indian_alaska_native',
  'native_hawaiian_pacific_islander',
  'two_or_more',
  DECLINE,
]);

export const VeteranSchema = z.enum(['not_veteran', 'protected_veteran', 'veteran_not_protected', DECLINE]);

export const DisabilitySchema = z.enum(['yes', 'no', DECLINE]);

export const EeoSchema = z.object({
  gender: GenderSchema.default(DECLINE),
  ethnicity: EthnicitySchema.default(DECLINE),
  veteran: VeteranSchema.default(DECLINE),
  disability: DisabilitySchema.default(DECLINE),
});

export const AnswersProfileSchema = z.object({
  workAuthorized: yesNo(), // legally allowed to work in the job's country
  needsSponsorship: yesNo(), // needs a visa sponsored by the employer, now or later
  willingToRelocate: yesNo(),
  over18: yesNo(),
  previouslyWorkedAtCompany: yesNo(),
  howDidYouHear: z.string().trim().default(''), // e.g. "LinkedIn"; matched to Workday's list later
  noticePeriod: z.string().trim().default(''), // e.g. "2 weeks"
  desiredSalary: z.string().trim().default(''), // optional; left blank unless the user fills it
  eeo: EeoSchema.prefault({}),
});

export type Eeo = z.infer<typeof EeoSchema>;
export type AnswersProfile = z.infer<typeof AnswersProfileSchema>;

export function defaultAnswersProfile(): AnswersProfile {
  return AnswersProfileSchema.parse({});
}

// --- Question texts and option labels (used by the Answers form, and later by the Mapper) ---

export type YesNoKey = 'workAuthorized' | 'needsSponsorship' | 'willingToRelocate' | 'over18' | 'previouslyWorkedAtCompany';

export const YES_NO_QUESTIONS: ReadonlyArray<{ key: YesNoKey; question: string; hint?: string }> = [
  { key: 'workAuthorized', question: 'Are you legally allowed to work in the country of the job?' },
  { key: 'needsSponsorship', question: 'Will you now or in the future need visa sponsorship to work there?' },
  { key: 'willingToRelocate', question: 'Are you willing to relocate?' },
  { key: 'over18', question: 'Are you at least 18 years old?' },
  {
    key: 'previouslyWorkedAtCompany',
    question: 'Have you worked for the company you are applying to before (as an employee or contractor)?',
    hint: 'One answer for all applications. Change it before applying to a company you worked for.',
  },
];

export const GENDER_LABELS: Record<z.infer<typeof GenderSchema>, string> = {
  male: 'Male',
  female: 'Female',
  non_binary: 'Non-binary',
  decline: 'Decline to self-identify',
};

export const ETHNICITY_LABELS: Record<z.infer<typeof EthnicitySchema>, string> = {
  hispanic_latino: 'Hispanic or Latino',
  white: 'White',
  black_african_american: 'Black or African American',
  asian: 'Asian',
  american_indian_alaska_native: 'American Indian or Alaska Native',
  native_hawaiian_pacific_islander: 'Native Hawaiian or Other Pacific Islander',
  two_or_more: 'Two or more races',
  decline: 'Decline to self-identify',
};

export const VETERAN_LABELS: Record<z.infer<typeof VeteranSchema>, string> = {
  not_veteran: 'I am not a veteran',
  protected_veteran: 'I am a protected veteran',
  veteran_not_protected: 'I am a veteran, but not a protected veteran',
  decline: 'Decline to self-identify',
};

export const DISABILITY_LABELS: Record<z.infer<typeof DisabilitySchema>, string> = {
  yes: 'Yes, I have a disability (or had one in the past)',
  no: 'No, I do not have a disability',
  decline: 'Decline to self-identify',
};

/**
 * How many questions Workday forms usually require that the user hasn't answered yet.
 * Optional ones (notice period, salary) and EEO (always has "decline") are not counted.
 */
export function countUnanswered(answers: AnswersProfile): number {
  const yesNoMissing = YES_NO_QUESTIONS.filter(({ key }) => answers[key] === null).length;
  return yesNoMissing + (answers.howDidYouHear.trim() ? 0 : 1);
}
