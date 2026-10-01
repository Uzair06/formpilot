import { describe, expect, it } from 'vitest';
import { matchOption } from '@/src/shared/match-option';

describe('matchOption', () => {
  const countries = ['United States of America', 'United Kingdom', 'India', 'Canada'];

  it('prefers exact matches, ignoring case and punctuation', () => {
    expect(matchOption('india', countries)).toBe('India');
    expect(matchOption('Yes', ['Yes', 'No'])).toBe('Yes');
  });

  it('accepts a unique start or part of an option', () => {
    expect(matchOption('United States', countries)).toBe('United States of America');
    expect(matchOption('Kingdom', countries)).toBe('United Kingdom');
  });

  it('forgives small typos but not unrelated words', () => {
    expect(matchOption('Canda', countries)).toBe('Canada');
    expect(matchOption('Germany', countries)).toBeNull();
  });

  it('refuses when the answer is ambiguous', () => {
    expect(matchOption('United', countries)).toBeNull();
  });
});
