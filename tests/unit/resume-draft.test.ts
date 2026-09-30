import { describe, expect, it } from 'vitest';
import { emptyJobDraft, emptySchoolDraft, fromDraft, toDraft, type ResumeDraft } from '@/src/profile/resume-draft';
import { ALEX_RIVERA_EXPECTED } from '../fixtures/resumes/alex-rivera.expected';

function draftOf(change: (draft: ResumeDraft) => void = () => {}): ResumeDraft {
  const draft = toDraft(ALEX_RIVERA_EXPECTED);
  change(draft);
  return draft;
}

function errorsOf(draft: ResumeDraft) {
  const result = fromDraft(draft);
  expect(result.ok).toBe(false);
  return result.ok ? {} : result.errors;
}

describe('resume draft', () => {
  it('turns a profile into a draft and back without changes', () => {
    expect(fromDraft(draftOf())).toEqual({ ok: true, profile: ALEX_RIVERA_EXPECTED });
  });

  it('shows years as text in the draft', () => {
    const draft = draftOf();
    expect(draft.workExperience[0]!.start).toEqual({ month: 3, year: '2022' });
    expect(draft.workExperience[0]!.end).toEqual({ month: null, year: '' });
    expect(draft.education[0]!.startYear).toBe('2017');
  });

  it('does not change the original profile when the draft is edited', () => {
    const draft = draftOf();
    draft.skills.push('Go');
    expect(ALEX_RIVERA_EXPECTED.skills).not.toContain('Go');
  });

  it('flags half-typed or impossible years', () => {
    const errors = errorsOf(
      draftOf((d) => {
        d.workExperience[0]!.start.year = '20';
        d.education[1]!.endYear = 'soon';
      }),
    );
    expect(errors).toEqual({
      'workExperience.0.start.year': 'Enter a 4-digit year, like 2021.',
      'education.1.endYear': 'Enter a 4-digit year, like 2021.',
    });
  });

  it('asks for the year when only a month is picked', () => {
    const errors = errorsOf(draftOf((d) => void (d.workExperience[1]!.end = { month: 5, year: '' })));
    expect(errors['workExperience.1.end.year']).toBe('Add the year too.');
  });

  it('flags an end date before the start date', () => {
    const errors = errorsOf(draftOf((d) => void (d.workExperience[1]!.end = { month: 1, year: '2019' })));
    expect(errors['workExperience.1.end.year']).toBe('The end date is before the start date.');
  });

  it('allows start and end in the same year when months are missing', () => {
    const result = fromDraft(
      draftOf((d) => {
        d.workExperience[1]!.start = { month: null, year: '2020' };
        d.workExperience[1]!.end = { month: null, year: '2020' };
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('ignores the end date of a current job', () => {
    const result = fromDraft(
      draftOf((d) => {
        d.workExperience[1]!.current = true;
        d.workExperience[1]!.end = { month: 1, year: 'junk' };
      }),
    );
    expect(result.ok && result.profile.workExperience[1]!.end).toBeNull();
  });

  it('flags an email or link that looks wrong', () => {
    const errors = errorsOf(
      draftOf((d) => {
        d.personal.email = 'alex at example';
        d.links.github = 'github.com/alex';
        d.links.other = ['https://ok.example', 'not a link'];
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(['links.github', 'links.other', 'personal.email']);
    expect(errors['links.other']).toBe('Line 2: start each link with https://');
  });

  it('accepts new empty jobs and schools', () => {
    const result = fromDraft(
      draftOf((d) => {
        d.workExperience.push(emptyJobDraft());
        d.education.push(emptySchoolDraft());
      }),
    );
    expect(result.ok && result.profile.workExperience[2]).toMatchObject({ title: '', start: null, end: null });
    expect(result.ok && result.profile.education[2]).toMatchObject({ school: '', startYear: null, endYear: null });
  });
});
