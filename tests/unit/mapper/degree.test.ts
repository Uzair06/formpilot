import { describe, expect, it } from 'vitest';
import { degreeCategory } from '@/src/mapper/rules';

describe('degreeCategory', () => {
  it.each([
    ['B.Tech', "Bachelor's Degree"],
    ['B.E. Computer Science', "Bachelor's Degree"],
    ['Bachelor of Science', "Bachelor's Degree"],
    ['BSc', "Bachelor's Degree"],
    ['M.S.', "Master's Degree"],
    ['M.Tech', "Master's Degree"],
    ['MBA', "Master's Degree"],
    ['Ph.D.', 'Doctorate'],
    ['Associate of Arts', "Associate's Degree"],
    ['High School', 'High School Diploma'],
  ])('%s → %s', (written, category) => {
    expect(degreeCategory(written)).toBe(category);
  });

  it('returns null for wording it does not know', () => {
    expect(degreeCategory('Certificate in Welding')).toBeNull();
  });
});
