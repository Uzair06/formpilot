import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import AnswersEditor from '@/entrypoints/sidepanel/answers/AnswersEditor';
import { defaultAnswersProfile } from '@/src/profile/answers';
import { loadAnswersProfile } from '@/src/profile/storage';
import { click, field, passTime, render, typeInto, type Rendered } from './render';

const wait = (ms: number) => passTime(ms, (t) => vi.advanceTimersByTimeAsync(t));

/** The radio button with text `choice` under the question `question`. */
function radio(container: HTMLElement, question: string, choice: string): HTMLInputElement {
  const group = [...container.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent === question);
  const label = [...(group?.querySelectorAll('label') ?? [])].find((l) => l.textContent === choice);
  const input = label?.querySelector('input');
  if (!input) throw new Error(`No "${choice}" option for "${question}"`);
  return input;
}

describe('AnswersEditor', () => {
  let view: Rendered;
  const onSaved = vi.fn();

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.useFakeTimers();
    onSaved.mockClear();
    view = await render(<AnswersEditor initial={defaultAnswersProfile()} onSaved={onSaved} />);
  });

  afterEach(async () => {
    await view.unmount();
    vi.useRealTimers();
  });

  it('starts with every yes/no unanswered and every EEO answer declined', () => {
    const notAnswered = [...view.container.querySelectorAll<HTMLInputElement>('input[type=radio][value=unanswered]')];
    expect(notAnswered).toHaveLength(5);
    expect(notAnswered.every((input) => input.checked)).toBe(true);
    for (const label of ['Gender', 'Race / ethnicity', 'Veteran status', 'Disability']) {
      expect(field<HTMLSelectElement>(view.container, label).value).toBe('decline');
    }
    expect(view.container.textContent).toContain('6 questions are not answered yet');
  });

  it('saves a yes/no answer and updates the counter', async () => {
    await click(radio(view.container, 'Are you at least 18 years old?', 'Yes'));
    expect(view.container.textContent).toContain('5 questions are not answered yet');
    await wait(700);
    expect((await loadAnswersProfile()).over18).toBe('yes');
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ over18: 'yes' }));
  });

  it('can set an answer back to "not answered"', async () => {
    const question = 'Are you willing to relocate?';
    await click(radio(view.container, question, 'No'));
    await wait(700);
    expect((await loadAnswersProfile()).willingToRelocate).toBe('no');
    await click(radio(view.container, question, 'Not answered'));
    await wait(700);
    expect((await loadAnswersProfile()).willingToRelocate).toBeNull();
  });

  it('saves text answers and EEO choices', async () => {
    await typeInto(field(view.container, 'How did you hear about the job?'), 'LinkedIn');
    await typeInto(field<HTMLSelectElement>(view.container, 'Veteran status'), 'not_veteran');
    await wait(700);
    const saved = await loadAnswersProfile();
    expect(saved.howDidYouHear).toBe('LinkedIn');
    expect(saved.eeo).toEqual({ gender: 'decline', ethnicity: 'decline', veteran: 'not_veteran', disability: 'decline' });
  });

  it('says "all set" once everything needed is answered', async () => {
    for (const question of [
      'Are you legally allowed to work in the country of the job?',
      'Will you now or in the future need visa sponsorship to work there?',
      'Are you willing to relocate?',
      'Are you at least 18 years old?',
      'Have you worked for the company you are applying to before (as an employee or contractor)?',
    ]) {
      await click(radio(view.container, question, 'No'));
    }
    await typeInto(field(view.container, 'How did you hear about the job?'), 'Company website');
    expect(view.container.textContent).toContain('All set.');
  });
});
