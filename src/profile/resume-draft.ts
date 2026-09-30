import {
  CertificationSchema,
  EducationSchema,
  ResumeProfileSchema,
  WorkExperienceSchema,
  type Education,
  type ResumeProfile,
  type WorkExperience,
  type YearMonth,
} from './resume';

// The edit form works on a "draft": the same shape as ResumeProfile, except year boxes hold
// text, because while typing a year is often half-finished ("20"). `fromDraft` turns a draft
// back into a real profile, or says which boxes need fixing.

export interface MonthYearDraft {
  month: number | null;
  year: string;
}

export type JobDraft = Omit<WorkExperience, 'start' | 'end'> & { start: MonthYearDraft; end: MonthYearDraft };
export type SchoolDraft = Omit<Education, 'startYear' | 'endYear'> & { startYear: string; endYear: string };
export type ResumeDraft = Omit<ResumeProfile, 'workExperience' | 'education'> & {
  workExperience: JobDraft[];
  education: SchoolDraft[];
};

/** Problems to show next to boxes, keyed by path, e.g. "workExperience.0.start.year". */
export type FieldErrors = Record<string, string>;

export type DraftResult = { ok: true; profile: ResumeProfile } | { ok: false; errors: FieldErrors };

const yearText = (year: number | null | undefined) => (year == null ? '' : String(year));
const monthYearDraft = (value: YearMonth | null): MonthYearDraft => ({ month: value?.month ?? null, year: yearText(value?.year) });

export function toDraft(profile: ResumeProfile): ResumeDraft {
  const copy = structuredClone(profile);
  return {
    ...copy,
    workExperience: copy.workExperience.map((job) => ({ ...job, start: monthYearDraft(job.start), end: monthYearDraft(job.end) })),
    education: copy.education.map((school) => ({
      ...school,
      startYear: yearText(school.startYear),
      endYear: yearText(school.endYear),
    })),
  };
}

export function emptyJobDraft(): JobDraft {
  const job = WorkExperienceSchema.parse({});
  return { ...job, start: monthYearDraft(null), end: monthYearDraft(null) };
}

export function emptySchoolDraft(): SchoolDraft {
  return { ...EducationSchema.parse({}), startYear: '', endYear: '' };
}

export function emptyCertification() {
  return CertificationSchema.parse({});
}

const EMAIL_LOOKS_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_LOOKS_OK = /^https?:\/\/\S+$/i;

export function fromDraft(draft: ResumeDraft): DraftResult {
  const errors: FieldErrors = {};

  // "" → null; otherwise it must be a sensible 4-digit year.
  function readYear(text: string, path: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const year = Number(trimmed);
    if (!/^\d{4}$/.test(trimmed) || year < 1900 || year > 2100) {
      errors[path] = 'Enter a 4-digit year, like 2021.';
      return null;
    }
    return year;
  }

  function readMonthYear(value: MonthYearDraft, path: string): YearMonth | null {
    const year = readYear(value.year, `${path}.year`);
    if (year === null) {
      if (value.month !== null && !errors[`${path}.year`]) errors[`${path}.year`] = 'Add the year too.';
      return null;
    }
    return { month: value.month, year };
  }

  // Compares two dates; a missing month counts as January for start and December for end.
  const monthIndex = (value: YearMonth, fallbackMonth: number) => value.year * 12 + (value.month ?? fallbackMonth);

  const workExperience = draft.workExperience.map((job, i) => {
    const start = readMonthYear(job.start, `workExperience.${i}.start`);
    const end = job.current ? null : readMonthYear(job.end, `workExperience.${i}.end`);
    if (start && end && monthIndex(end, 12) < monthIndex(start, 1)) {
      errors[`workExperience.${i}.end.year`] = 'The end date is before the start date.';
    }
    return { ...job, start, end };
  });

  const education = draft.education.map((school, i) => {
    const startYear = readYear(school.startYear, `education.${i}.startYear`);
    const endYear = readYear(school.endYear, `education.${i}.endYear`);
    if (startYear !== null && endYear !== null && endYear < startYear) {
      errors[`education.${i}.endYear`] = 'The end year is before the start year.';
    }
    return { ...school, startYear, endYear };
  });

  const email = draft.personal.email.trim();
  if (email && !EMAIL_LOOKS_OK.test(email)) errors['personal.email'] = 'This does not look like an email address.';

  for (const key of ['linkedin', 'github', 'portfolio'] as const) {
    const url = draft.links[key].trim();
    if (url && !URL_LOOKS_OK.test(url)) errors[`links.${key}`] = 'Start the link with https://';
  }
  draft.links.other.forEach((url, i) => {
    if (!URL_LOOKS_OK.test(url.trim())) errors['links.other'] ??= `Line ${i + 1}: start each link with https://`;
  });

  // Last check with the real schema, so a saved profile always fits it.
  const parsed = ResumeProfileSchema.safeParse({ ...draft, workExperience, education });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[issue.path.join('.')] ??= issue.message;
  }

  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, profile: parsed.data };
}
