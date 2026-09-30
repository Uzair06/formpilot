import { describe, expect, it } from 'vitest';
import { cleanText, uniqueWebLinks } from '@/src/parser/clean-text';

describe('cleanText', () => {
  it('trims lines, squeezes spaces and limits blank lines', () => {
    expect(cleanText('  Alex   Rivera \r\n\r\n\r\n\r\nEngineer\t\tat  Acme  ')).toBe('Alex Rivera\n\nEngineer at Acme');
  });

  it('turns odd spaces into normal spaces and drops invisible junk', () => {
    expect(cleanText('Alex Rivera\u0000�')).toBe('Alex Rivera');
  });
});

describe('uniqueWebLinks', () => {
  it('keeps web links once, in order, and drops other kinds', () => {
    expect(
      uniqueWebLinks(['https://a.example', 'mailto:x@example.com', ' https://a.example ', 'http://b.example']),
    ).toEqual(['https://a.example', 'http://b.example']);
  });
});
