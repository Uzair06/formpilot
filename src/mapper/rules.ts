import type { AnswersProfile, YesNoKey } from '@/src/profile/answers';
import { DISABILITY_LABELS, ETHNICITY_LABELS, GENDER_LABELS, VETERAN_LABELS } from '@/src/profile/answers';
import type { ResumeProfile, YearMonth } from '@/src/profile/resume';
import type { FieldDescriptor } from '@/src/scanner/types';
import { normalize } from '@/src/shared/match-option';
import type { FieldDecision } from './types';

// Pass 1: simple label rules ("Given Name" → first name). Fast, free, and predictable.
// Returns null when no rule applies, so the field goes to the AI pass.

export type RuleResult = Pick<FieldDecision, 'value' | 'source' | 'reason' | 'status'> & { confidence?: number };

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: YearMonth | null) => (d ? (d.month ? `${pad(d.month)}/${d.year}` : String(d.year)) : null);

/** Which repeat of a section a field is in: "Work Experience 2" → 1. */
export function repeatIndex(section: string): number {
  const match = section.match(/(\d+)\s*$/);
  return match ? Number(match[1]) - 1 : 0;
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

// Phrases that mean "I don't want to answer" on EEO questions.
export const DECLINE_PATTERN = /decline|do not wish|don t wish|prefer not|choose not|not to (answer|disclose|self identify)|i don t want/;

/** Consent / legal checkboxes: never ticked automatically (Hard Rule 4). */
export const CONSENT_PATTERN = /agree|acknowledge|consent|terms|privacy|certify|attest|i understand|accept/;

const YES_NO_PATTERNS: Array<[YesNoKey, RegExp]> = [
  ['needsSponsorship', /sponsor|visa|immigration/],
  ['workAuthorized', /(legally )?(authori[sz]ed|eligible|permitted|right) (to work|for employment)|work authori[sz]ation|employment authori[sz]ation/],
  ['willingToRelocate', /relocat/],
  ['over18', /18 years|age of 18|at least 18|over 18/],
  ['previouslyWorkedAtCompany', /(previously|ever|have you) (been )?(worked|employed)|former (employee|worker)|worked (for|at) (nvidia|this company|us) before|(been|are you currently,? or have you been) an? (contractor|employee) (with|of|at|for)/],
];

export function ruleFor(field: FieldDescriptor, profile: ResumeProfile, answers: AnswersProfile): RuleResult | null {
  const label = normalize(`${field.label} ${field.helperText}`);
  const section = normalize(field.section);
  const fill = (value: string | string[] | null | undefined, reason: string, source: RuleResult['source'] = 'rule'): RuleResult =>
    value && (typeof value === 'string' ? value.trim() : value.length)
      ? { value, source, reason, status: 'fill', confidence: 1 }
      : { value: null, source, reason: `${reason}: nothing saved in your profile`, status: 'skip' };

  // --- safety first ---
  if (field.type === 'checkbox' && has(label, CONSENT_PATTERN)) {
    return { value: null, source: 'policy', reason: 'Consent / legal box: please read and tick it yourself', status: 'flag' };
  }
  // Consent asked as a Yes/No question (e.g. "By selecting YES you are granting … permission to contact you").
  if (['select', 'radio'].includes(field.type) && has(label, /by selecting yes|grant(ing)? .{0,40}permission|terms and conditions|privacy policy|i consent/)) {
    return { value: null, source: 'policy', reason: 'Consent question: please read and answer it yourself', status: 'flag' };
  }
  if (field.type === 'file') return fill('resume', 'Your resume file');

  // --- EEO / voluntary self-identification: only from the Answers tab, never guessed ---
  const eeo = eeoRule(label, answers);
  if (eeo) return eeo;

  // --- yes/no questions from the Answers tab ---
  if (['radio', 'select'].includes(field.type)) {
    for (const [key, pattern] of YES_NO_PATTERNS) {
      if (!has(label, pattern)) continue;
      const answer = answers[key];
      return answer
        ? { value: answer === 'yes' ? 'Yes' : 'No', source: 'answers', reason: 'From your Answers tab', status: 'fill', confidence: 1 }
        : { value: null, source: 'answers', reason: 'Please answer this in the Answers tab (or on the page)', status: 'flag' };
    }
  }
  if (has(label, /how did you hear|where did you (hear|learn|find)|source/)) return fill(answers.howDidYouHear, 'From your Answers tab', 'answers');
  if (has(label, /notice period/)) return fill(answers.noticePeriod, 'From your Answers tab', 'answers');
  if (has(label, /salary|compensation|pay expectation/)) return fill(answers.desiredSalary, 'From your Answers tab', 'answers');

  // --- work experience (repeatable) ---
  if (has(section, /work experience|employment|job history/)) {
    const job = profile.workExperience[repeatIndex(field.section)];
    if (!job) return { value: null, source: 'rule', reason: 'No matching job in your profile', status: 'skip' };
    if (field.type === 'checkbox' && has(label, /current/)) return { value: String(job.current), source: 'rule', reason: 'Current job', status: 'fill', confidence: 1 };
    if (has(label, /job title|position|title/)) return fill(job.title, 'Job title');
    if (has(label, /company|employer|organi[sz]ation/)) return fill(job.company, 'Company');
    if (has(label, /location|city/)) return fill(job.location, 'Job location');
    if (has(label, /^from|start/)) return fill(dateValue(job.start), 'Start date');
    if (has(label, /^to\b|end/)) return job.current ? { value: null, source: 'rule', reason: 'Current job has no end date', status: 'skip' } : fill(dateValue(job.end), 'End date');
    if (has(label, /description|responsibilit|summary|role/)) return fill(job.description, 'What you did');
  }

  // --- education (repeatable) ---
  if (has(section, /education/)) {
    const school = profile.education[repeatIndex(field.section)];
    if (!school) return { value: null, source: 'rule', reason: 'No matching school in your profile', status: 'skip' };
    if (has(label, /school|university|college|institution/)) return fill(school.school, 'School');
    if (has(label, /degree/)) return null; // Workday degree lists vary ("Master's Degree" vs "M.S."): let the AI pick the option
    if (has(label, /field of study|major|discipline/)) return fill(school.fieldOfStudy, 'Field of study');
    if (has(label, /gpa|grade/)) return fill(school.gpa, 'GPA');
    if (has(label, /^from|start/)) return fill(school.startYear ? String(school.startYear) : null, 'Start year');
    if (has(label, /^to\b|end|graduat/)) return fill(school.endYear ? String(school.endYear) : null, 'End year');
  }

  // --- websites (repeatable "URL" entries) ---
  if (has(section, /^websites?\b/)) {
    const url = websiteLinks(profile)[repeatIndex(field.section)];
    return url ? fill(url, 'Website from your resume') : { value: null, source: 'rule', reason: 'No more links in your profile', status: 'skip' };
  }

  // --- personal details ---
  const p = profile.personal;
  if (field.type === 'checkbox' && has(label, /preferred name/)) return { value: 'false', source: 'rule', reason: 'Uses your legal name', status: 'skip' };
  // "Local" names are for names in another script (e.g. Chinese characters): left empty on purpose.
  if (has(label, /^local /)) return { value: null, source: 'rule', reason: 'Local-script name: left empty', status: 'skip' };
  if (has(label, /middle name/)) return fill(p.middleName, 'Middle name');
  if (has(label, /preferred name|nickname/)) return fill(p.preferredName, 'Preferred name');
  if (has(label, /first name|given name|forename/)) return fill(p.firstName, 'First name');
  if (has(label, /last name|family name|surname/)) return fill(p.lastName, 'Last name');
  if (has(label, /e ?mail/)) return fill(p.email, 'Email');
  if (has(label, /device type|phone type/)) return fill(p.phone.type[0]!.toUpperCase() + p.phone.type.slice(1), 'Phone type');
  if (has(label, /country (phone )?code|phone code|dialing code/)) return fill(p.address.country || p.phone.countryCode, 'Phone country code');
  if (has(label, /extension/)) return { value: null, source: 'rule', reason: 'No phone extension', status: 'skip' };
  if (has(label, /phone|mobile|telephone/)) return fill(p.phone.number, 'Phone number');
  if (has(label, /address line 2|apartment|suite/)) return { value: null, source: 'rule', reason: 'No second address line', status: 'skip' };
  if (has(label, /address( line 1)?$|street/)) return fill(p.address.line1, 'Street address');
  if (has(label, /city|town/)) return fill(p.address.city, 'City');
  if (has(label, /state|province|region/)) return fill(p.address.state, 'State');
  if (has(label, /postal|zip/)) return fill(p.address.postalCode, 'Postal code');
  if (has(label, /country|nation/)) return fill(p.address.country, 'Country');

  // --- links ---
  const l = profile.links;
  if (has(label, /linkedin/)) return fill(l.linkedin, 'LinkedIn');
  if (has(label, /github/)) return fill(l.github, 'GitHub');
  if (has(label, /website|portfolio|personal (site|url)/)) return fill(l.portfolio || l.other[0], 'Website');

  // --- skills (multi-pick search box) ---
  if (field.type === 'prompt' && has(label, /skill/)) return fill(profile.skills.slice(0, 15), 'Skills from your resume');

  return null;
}

/** Links for the Websites section (LinkedIn has its own question on Workday forms). */
export function websiteLinks(profile: ResumeProfile): string[] {
  const { github, portfolio, other } = profile.links;
  return [...new Set([github, portfolio, ...other].filter(Boolean))];
}

function eeoRule(label: string, answers: AnswersProfile): RuleResult | null {
  const pick = <K extends string>(value: K, labels: Record<K, string>, what: string): RuleResult => ({
    value: value === 'decline' ? 'decline' : labels[value],
    source: 'answers',
    reason: value === 'decline' ? `${what}: decline to self-identify (default)` : `${what}: from your Answers tab`,
    status: 'fill',
    confidence: 1,
  });
  if (/\bgender\b|\bsex\b/.test(label)) return pick(answers.eeo.gender, GENDER_LABELS, 'Gender');
  if (/ethnic|race|hispanic|latino/.test(label)) return pick(answers.eeo.ethnicity, ETHNICITY_LABELS, 'Ethnicity');
  if (/veteran|military/.test(label)) return pick(answers.eeo.veteran, VETERAN_LABELS, 'Veteran status');
  if (/disabilit/.test(label)) return pick(answers.eeo.disability, DISABILITY_LABELS, 'Disability');
  return null;
}
