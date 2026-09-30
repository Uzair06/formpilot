// @vitest-environment node
// Sends the FAKE resume to the real Gemini API. Run with:
//   GEMINI_API_KEY=your-key npm run test:live
// Optional: GEMINI_MODEL=some-model-id to try a specific model (default: Google's newest Flash alias).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeminiProvider } from '@/src/ai/gemini';
import { parseResumeWithAi } from '@/src/parser/parse-resume';
import { readResume } from '@/src/parser/read-resume';
import { ALEX_RIVERA_EXPECTED as EXPECTED } from '../fixtures/resumes/alex-rivera.expected';

const apiKey = process.env.GEMINI_API_KEY ?? '';
const model = process.env.GEMINI_MODEL || undefined;

describe.skipIf(!apiKey).each(['alex-rivera.pdf', 'alex-rivera.docx'])('real Gemini reading %s', (name) => {
  it('extracts the resume correctly', { timeout: 120_000 }, async () => {
    const buffer = readFileSync(resolve(__dirname, '../fixtures/resumes', name));
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const { text, links } = await readResume({ name, type: '', bytes });

    const profile = await parseResumeWithAi(createGeminiProvider(apiKey, { model }), { text, links });
    console.log(`${name}: confidence ${profile.meta.confidence}, warnings:`, profile.meta.warnings);

    expect(profile.personal).toMatchObject({
      firstName: EXPECTED.personal.firstName,
      lastName: EXPECTED.personal.lastName,
      email: EXPECTED.personal.email,
    });
    expect(profile.personal.phone.number.replace(/\D/g, '')).toContain('5550100142');
    expect(profile.personal.address.city).toBe(EXPECTED.personal.address.city);

    expect(profile.links.linkedin).toBe(EXPECTED.links.linkedin);
    expect(profile.links.github).toBe(EXPECTED.links.github);
    expect(profile.links.portfolio.replace(/\/$/, '')).toBe(EXPECTED.links.portfolio);

    // Jobs: exact titles, companies, dates and "current" flags.
    const pick = (jobs: typeof EXPECTED.workExperience) =>
      jobs.map(({ title, company, start, end, current }) => ({ title, company, start, end, current }));
    expect(pick(profile.workExperience)).toEqual(pick(EXPECTED.workExperience));

    expect(profile.education.map((e) => [e.school, e.startYear, e.endYear])).toEqual(
      EXPECTED.education.map((e) => [e.school, e.startYear, e.endYear]),
    );
    expect(profile.education[0]?.fieldOfStudy).toBe('Computer Science');

    expect(profile.skills).toEqual(expect.arrayContaining(EXPECTED.skills));
    expect(profile.languages).toEqual(EXPECTED.languages);
    expect(profile.certifications[0]?.name).toBe(EXPECTED.certifications[0]?.name);
  });
});
