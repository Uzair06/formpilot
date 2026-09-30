import type { ResumeProfile } from '@/src/profile/resume';

// A safety net after the AI: values that must be copied from the resume (email, phone,
// links) are checked against the source. Anything the AI seems to have made up is
// cleared and a warning is added, so the user fills it in instead of a wrong value being used.

const normalizeUrl = (url: string) =>
  url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const digitsOnly = (value: string) => value.replace(/\D/g, '');

export function verifyAgainstSource(profile: ResumeProfile, text: string, links: string[]): ResumeProfile {
  const result = structuredClone(profile);
  const warnings = result.meta.warnings;
  const lowerText = text.toLowerCase();
  const knownUrls = [...links.map(normalizeUrl), lowerText.replace(/https?:\/\/|www\./g, '')];
  const urlIsInSource = (url: string) => knownUrls.some((source) => source.includes(normalizeUrl(url)));

  const { personal } = result;
  if (personal.email && !lowerText.includes(personal.email.toLowerCase())) {
    personal.email = '';
    warnings.push('Removed the email address: it was not found in the resume. Please add it.');
  }

  const phoneDigits = digitsOnly(personal.phone.number);
  if (phoneDigits && !digitsOnly(text).includes(phoneDigits)) {
    personal.phone.number = '';
    personal.phone.countryCode = '';
    warnings.push('Removed the phone number: it was not found in the resume. Please add it.');
  }

  for (const key of ['linkedin', 'github', 'portfolio'] as const) {
    const url = result.links[key];
    if (url && !urlIsInSource(url)) {
      result.links[key] = '';
      warnings.push(`Removed the ${key} link: it was not found in the resume. Please add it.`);
    }
  }
  const otherBefore = result.links.other.length;
  result.links.other = result.links.other.filter(urlIsInSource);
  if (result.links.other.length < otherBefore) {
    warnings.push('Removed some links that were not found in the resume.');
  }

  return result;
}
