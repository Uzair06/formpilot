import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, type AiProvider } from '@/src/ai/provider';
import { parseResumeWithAi } from '@/src/parser/parse-resume';
import { ALEX_RIVERA_EXPECTED } from '../../fixtures/resumes/alex-rivera.expected';

const SOURCE_TEXT = [
  'Alex J. Rivera',
  'San Jose, CA 95112, USA · +1 (555) 010-0142 · alex.rivera@example.com',
  'LinkedIn · GitHub · Portfolio',
].join('\n');
const SOURCE_LINKS = [
  'https://www.linkedin.com/in/alex-rivera-example',
  'https://github.com/alex-rivera-example',
  'https://alexrivera.example.com/',
];
const INPUT = { text: SOURCE_TEXT, links: SOURCE_LINKS };

/** A pretend AI that gives the answers in `replies` one by one (an Error is thrown instead). */
function fakeProvider(...replies: unknown[]): AiProvider & { calls: number } {
  const provider = {
    name: 'fake',
    calls: 0,
    async generateJson() {
      const reply = replies[provider.calls++];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return provider;
}

describe('parseResumeWithAi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns the checked profile from a good answer', async () => {
    const provider = fakeProvider(ALEX_RIVERA_EXPECTED);
    expect(await parseResumeWithAi(provider, INPUT)).toEqual(ALEX_RIVERA_EXPECTED);
    expect(provider.calls).toBe(1);
  });

  it('fills in fields the AI left out', async () => {
    const profile = await parseResumeWithAi(fakeProvider({ personal: { firstName: 'Alex' } }), INPUT);
    expect(profile.personal.firstName).toBe('Alex');
    expect(profile.workExperience).toEqual([]);
  });

  it('tries once more after an unusable answer', async () => {
    const provider = fakeProvider({ meta: { confidence: 'very high' } }, ALEX_RIVERA_EXPECTED);
    expect((await parseResumeWithAi(provider, INPUT)).personal.lastName).toBe('Rivera');
    expect(provider.calls).toBe(2);
  });

  it('also retries when the answer was not JSON at all', async () => {
    const provider = fakeProvider(new AiError('invalid_output'), ALEX_RIVERA_EXPECTED);
    await parseResumeWithAi(provider, INPUT);
    expect(provider.calls).toBe(2);
  });

  it('gives up after two unusable answers', async () => {
    const provider = fakeProvider({ skills: 'lots' }, { skills: 'still lots' });
    await expect(parseResumeWithAi(provider, INPUT)).rejects.toMatchObject({ code: 'invalid_output' });
    expect(provider.calls).toBe(2);
  });

  it('does not retry problems a retry cannot fix', async () => {
    const provider = fakeProvider(new AiError('invalid_api_key'), ALEX_RIVERA_EXPECTED);
    await expect(parseResumeWithAi(provider, INPUT)).rejects.toMatchObject({ code: 'invalid_api_key' });
    expect(provider.calls).toBe(1);
  });

  it('clears made-up contact details and links, with warnings', async () => {
    const madeUp = structuredClone(ALEX_RIVERA_EXPECTED);
    madeUp.personal.email = 'alex@invented.example';
    madeUp.personal.phone.number = '555-999-0000';
    madeUp.links.github = 'https://github.com/someone-else';
    madeUp.links.other = ['https://alexrivera.example.com', 'https://invented.example/blog'];

    const profile = await parseResumeWithAi(fakeProvider(madeUp), INPUT);

    expect(profile.personal.email).toBe('');
    expect(profile.personal.phone.number).toBe('');
    expect(profile.links.github).toBe('');
    expect(profile.links.linkedin).toBe(ALEX_RIVERA_EXPECTED.links.linkedin); // real link kept
    expect(profile.links.other).toEqual(['https://alexrivera.example.com']);
    expect(profile.meta.warnings).toHaveLength(4);
  });

  it('accepts links that differ only in https/www/trailing slash', async () => {
    const answer = structuredClone(ALEX_RIVERA_EXPECTED);
    answer.links.linkedin = 'http://linkedin.com/in/alex-rivera-example/';
    const profile = await parseResumeWithAi(fakeProvider(answer), INPUT);
    expect(profile.links.linkedin).toBe('http://linkedin.com/in/alex-rivera-example/');
    expect(profile.meta.warnings).toEqual([]);
  });
});
