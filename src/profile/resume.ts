import { z } from 'zod';

// The structured resume: what the AI produces from resume text and what the user edits.
//
// Missing text is '' (easy to bind to form inputs); missing numbers/dates are null.
// Every field has a default, so a partial object (from the AI or older saved data)
// still parses into a complete profile.
//
// Nested objects use .prefault({}) instead of .default({}): in zod 4, .default() returns
// the default as-is, while .prefault() runs it through the schema so inner defaults apply.

const text = () => z.string().trim().default('');

export const YearMonthSchema = z.object({
  month: z.number().int().min(1).max(12).nullable().default(null),
  year: z.number().int().min(1900).max(2100),
});

export const PhoneSchema = z.object({
  countryCode: text(), // e.g. "+1"
  number: text(),
  type: z.enum(['mobile', 'home', 'work']).default('mobile'),
});

export const AddressSchema = z.object({
  line1: text(),
  city: text(),
  state: text(),
  postalCode: text(),
  country: text(),
});

export const PersonalSchema = z.object({
  firstName: text(),
  middleName: text(),
  lastName: text(),
  preferredName: text(),
  email: text(), // not format-checked here, so one odd email can't reject a whole parse
  phone: PhoneSchema.prefault({}),
  address: AddressSchema.prefault({}),
});

export const LinksSchema = z.object({
  linkedin: text(),
  github: text(),
  portfolio: text(),
  other: z.array(z.string()).default(() => []),
});

export const WorkExperienceSchema = z.object({
  title: text(),
  company: text(),
  location: text(),
  start: YearMonthSchema.nullable().default(null),
  end: YearMonthSchema.nullable().default(null), // null when current or unknown
  current: z.boolean().default(false),
  description: text(),
});

export const EducationSchema = z.object({
  school: text(),
  degree: text(),
  fieldOfStudy: text(),
  startYear: z.number().int().nullable().default(null),
  endYear: z.number().int().nullable().default(null),
  gpa: text(), // text, because resumes write it many ways ("3.8/4.0", "8.9 CGPA")
});

export const CertificationSchema = z.object({
  name: text(),
  issuer: text(),
  date: text(),
});

export const ResumeMetaSchema = z.object({
  warnings: z.array(z.string()).default(() => []), // things the parser was unsure about
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export const ResumeProfileSchema = z.object({
  personal: PersonalSchema.prefault({}),
  links: LinksSchema.prefault({}),
  workExperience: z.array(WorkExperienceSchema).default(() => []),
  education: z.array(EducationSchema).default(() => []),
  skills: z.array(z.string()).default(() => []),
  certifications: z.array(CertificationSchema).default(() => []),
  languages: z.array(z.string()).default(() => []),
  summary: text(),
  meta: ResumeMetaSchema.prefault({}),
});

export type YearMonth = z.infer<typeof YearMonthSchema>;
export type WorkExperience = z.infer<typeof WorkExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

export function emptyResumeProfile(): ResumeProfile {
  return ResumeProfileSchema.parse({});
}
