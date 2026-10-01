import { describe, expect, it, vi } from 'vitest';
import { mapFields } from '@/src/mapper/map';
import { defaultAnswersProfile } from '@/src/profile/answers';
import type { FieldDescriptor } from '@/src/scanner/types';
import { ALEX_RIVERA_EXPECTED as PROFILE } from '../../fixtures/resumes/alex-rivera.expected';

let n = 0;
const field = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  id: `f${n++}`, label, helperText: '', section: '', type: 'text', required: false, currentValue: '', options: [], automationId: '', ...extra,
});

const answers = () => {
  const a = defaultAnswersProfile();
  a.workAuthorized = 'yes';
  a.needsSponsorship = 'no';
  a.howDidYouHear = 'LinkedIn';
  return a;
};

const noAi = vi.fn(async () => []);

describe('mapFields', () => {
  it('fills personal details by label, including Workday wording', async () => {
    const fields = [field('Given Name(s)'), field('Family Name'), field('Email Address'), field('Phone Number'), field('City'), field('Postal Code')];
    const decisions = await mapFields(fields, PROFILE, answers(), noAi);
    expect(decisions.map((d) => [d.value, d.status])).toEqual([
      ['Alex', 'fill'], ['Rivera', 'fill'], ['alex.rivera@example.com', 'fill'], ['(555) 010-0142', 'fill'], ['San Jose', 'fill'], ['95112', 'fill'],
    ]);
  });

  it('fills the right job and school by section number, with dates as MM/YYYY', async () => {
    const decisions = await mapFields(
      [
        field('Job Title', { section: 'Work Experience 2' }),
        field('Company', { section: 'Work Experience 2' }),
        field('From', { section: 'Work Experience 2', type: 'date' }),
        field('To', { section: 'Work Experience 2', type: 'date' }),
        field('I currently work here', { section: 'Work Experience 1', type: 'checkbox' }),
        field('School or University', { section: 'Education 1' }),
      ],
      PROFILE, answers(), noAi,
    );
    expect(decisions.map((d) => d.value)).toEqual(['Software Engineer', 'Sample Storage Systems', '06/2019', '02/2022', 'true', 'University of Example']);
  });

  it('answers yes/no questions only from the Answers tab, using the real option text', async () => {
    const opts = { type: 'radio' as const, options: ['Yes', 'No'] };
    const decisions = await mapFields(
      [
        field('Are you legally authorized to work in the United States?', opts),
        field('Will you now or in the future require sponsorship for employment visa status?', opts),
        field('Are you willing to relocate?', opts),
      ],
      PROFILE, answers(), noAi,
    );
    expect(decisions.map((d) => [d.value, d.status])).toEqual([['Yes', 'fill'], ['No', 'fill'], [null, 'flag']]);
  });

  it('picks "decline" for EEO questions by default and never asks the AI', async () => {
    const ai = vi.fn(async () => []);
    const decisions = await mapFields(
      [field('Gender', { type: 'select', options: ['Male', 'Female', 'I do not wish to answer'] }), field('Please select your Veteran Status', { type: 'select', options: ['I am not a veteran', 'I decline to self-identify'] })],
      PROFILE, answers(), ai,
    );
    expect(decisions.map((d) => d.value)).toEqual(['I do not wish to answer', 'I decline to self-identify']);
    expect(ai).not.toHaveBeenCalled();
  });

  it('never ticks consent boxes and never answers sensitive questions', async () => {
    const ai = vi.fn(async () => []);
    const decisions = await mapFields(
      [field('I have read and agree to the terms and conditions', { type: 'checkbox' }), field('Date of Birth')],
      PROFILE, answers(), ai,
    );
    expect(decisions.map((d) => d.status)).toEqual(['flag', 'flag']);
    expect(ai).not.toHaveBeenCalled();
  });

  it('keeps values that are already on the page', async () => {
    const [decision] = await mapFields([field('Given Name', { currentValue: 'Alexander' })], PROFILE, answers(), noAi);
    expect(decision).toMatchObject({ value: 'Alexander', source: 'prefilled', status: 'skip' });
  });

  it('sends the rest to the AI once, and applies confidence and option checks', async () => {
    const years = field('How many years of experience do you have with CUDA?');
    const degree = field('Degree', { section: 'Education 1', type: 'select', options: ["Bachelor's Degree", "Master's Degree"] });
    const why = field('Why do you want to join us?', { type: 'textarea' });
    const bogus = field('Preferred office', { type: 'select', options: ['Santa Clara', 'Austin'] });
    const ai = vi.fn(async () => [
      { id: years.id, value: '6', confidence: 0.8, reason: 'Resume shows 6 years' },
      { id: degree.id, value: "Master's Degree", confidence: 0.9, reason: 'M.S.' },
      { id: why.id, value: 'I build storage systems.', confidence: 0.55, reason: 'Draft' },
      { id: bogus.id, value: 'Mars', confidence: 0.9, reason: '?' },
    ]);
    const decisions = await mapFields([years, degree, why, bogus], PROFILE, answers(), ai);
    expect(ai).toHaveBeenCalledOnce();
    expect(decisions.map((d) => [d.value, d.status])).toEqual([['6', 'fill'], ["Master's Degree", 'fill'], ['I build storage systems.', 'suggest'], [null, 'skip']]);
  });

  it('keeps going when the AI is unavailable', async () => {
    const decisions = await mapFields([field('Given Name'), field('Favourite GPU?')], PROFILE, answers(), async () => {
      throw new Error('Gemini is busy');
    });
    expect(decisions.map((d) => d.status)).toEqual(['fill', 'skip']);
    expect(decisions[1]!.reason).toContain('Gemini is busy');
  });
});
