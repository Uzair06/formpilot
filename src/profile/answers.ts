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
