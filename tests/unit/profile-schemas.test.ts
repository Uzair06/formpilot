import { describe, expect, it } from 'vitest';
import { AnswersProfileSchema, defaultAnswersProfile } from '@/src/profile/answers';
import { ResumeProfileSchema, emptyResumeProfile } from '@/src/profile/resume';

describe('ResumeProfileSchema', () => {
  it('builds a complete empty profile from nothing', () => {
    const empty = emptyResumeProfile();
    expect(empty.personal.firstName).toBe('');
    expect(empty.personal.phone).toEqual({ countryCode: '', number: '', type: 'mobile' });
    expect(empty.personal.address.city).toBe('');
    expect(empty.links.other).toEqual([]);
    expect(empty.workExperience).toEqual([]);
    expect(empty.meta).toEqual({ warnings: [], confidence: null });
  });

  it('fills in missing fields of a partial profile', () => {
    const parsed = ResumeProfileSchema.parse({
      personal: { firstName: '  Jane ', email: 'jane@example.com' },
      workExperience: [{ title: 'Engineer', company: 'Acme', start: { year: 2020 } }],
    });
    expect(parsed.personal.firstName).toBe('Jane'); // trimmed
    expect(parsed.personal.lastName).toBe('');
    expect(parsed.workExperience[0]).toEqual({
      title: 'Engineer',
      company: 'Acme',
      location: '',
      start: { month: null, year: 2020 },
      end: null,
      current: false,
      description: '',
    });
  });

  it('gives each empty profile its own lists', () => {
    const a = emptyResumeProfile();
    const b = emptyResumeProfile();
    a.skills.push('Go');
    expect(b.skills).toEqual([]);
  });

  it('rejects impossible values', () => {
    expect(ResumeProfileSchema.safeParse({ workExperience: [{ start: { month: 13, year: 2020 } }] }).success).toBe(false);
    expect(ResumeProfileSchema.safeParse({ meta: { confidence: 1.5 } }).success).toBe(false);
    expect(ResumeProfileSchema.safeParse({ personal: { phone: { type: 'fax' } } }).success).toBe(false);
  });
});

describe('AnswersProfileSchema', () => {
  it('defaults EEO to decline and yes/no questions to unanswered', () => {
    const answers = defaultAnswersProfile();
    expect(answers.eeo).toEqual({ gender: 'decline', ethnicity: 'decline', veteran: 'decline', disability: 'decline' });
    expect(answers.workAuthorized).toBeNull();
    expect(answers.needsSponsorship).toBeNull();
    expect(answers.howDidYouHear).toBe('');
  });

  it('keeps EEO answers the user chose', () => {
    const answers = AnswersProfileSchema.parse({ eeo: { gender: 'female' } });
    expect(answers.eeo.gender).toBe('female');
    expect(answers.eeo.veteran).toBe('decline');
  });

  it('rejects values outside the allowed lists', () => {
    expect(AnswersProfileSchema.safeParse({ eeo: { gender: 'unknown' } }).success).toBe(false);
    expect(AnswersProfileSchema.safeParse({ workAuthorized: 'maybe' }).success).toBe(false);
  });
});
