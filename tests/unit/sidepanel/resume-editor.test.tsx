import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import ResumeEditor from '@/entrypoints/sidepanel/resume/ResumeEditor';
import { loadResumeProfile, saveResumeProfile } from '@/src/profile/storage';
import { ALEX_RIVERA_EXPECTED } from '../../fixtures/resumes/alex-rivera.expected';
import { button, click, field, passTime, render, typeInto, type Rendered } from './render';

const status = (r: Rendered) => r.container.querySelector('.save-status')?.textContent;
const wait = (ms: number) => passTime(ms, (t) => vi.advanceTimersByTimeAsync(t));

describe('ResumeEditor', () => {
  let view: Rendered;

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.useFakeTimers();
    await saveResumeProfile(ALEX_RIVERA_EXPECTED);
    view = await render(<ResumeEditor initial={ALEX_RIVERA_EXPECTED} />);
  });

  afterEach(async () => {
    await view.unmount();
    vi.useRealTimers();
  });

  it('shows the profile in the boxes', () => {
    expect(field(view.container, 'First name').value).toBe('Alex');
    expect(field(view.container, 'Email').value).toBe('alex.rivera@example.com');
    expect(field(view.container, 'Job title', 1).value).toBe('Software Engineer');
    expect(field<HTMLTextAreaElement>(view.container, 'Skills').value.split('\n')).toHaveLength(9);
    expect(status(view)).toBe('All changes saved');
  });

  it('saves a change shortly after typing stops', async () => {
    await typeInto(field(view.container, 'First name'), 'Alexandra');
    expect(status(view)).toBe('Saving…');
    expect((await loadResumeProfile())?.personal.firstName).toBe('Alex'); // not yet

    await wait(700);
    expect(status(view)).toBe('All changes saved');
    expect((await loadResumeProfile())?.personal.firstName).toBe('Alexandra');
  });

  it('does not save a half-typed year, and shows what to fix', async () => {
    await typeInto(field(view.container, 'Start', 0), '20');
    await wait(700);
    expect(status(view)).toBe('Not saved — fix the boxes marked in red');
    expect(view.container.querySelector('.field-error')?.textContent).toBe('Enter a 4-digit year, like 2021.');
    expect((await loadResumeProfile())?.workExperience[0]?.start?.year).toBe(2022);

    await typeInto(field(view.container, 'Start', 0), '2021');
    await wait(700);
    expect(status(view)).toBe('All changes saved');
    expect((await loadResumeProfile())?.workExperience[0]?.start).toEqual({ month: 3, year: 2021 });
  });

  it('adds and removes jobs', async () => {
    await click(button(view.container, '+ Add job'));
    expect(view.container.textContent).toContain('Work experience (3)');
    await wait(700);
    expect((await loadResumeProfile())?.workExperience).toHaveLength(3);

    const removeButtons = [...view.container.querySelectorAll('.entry-card button')].filter((b) => b.textContent === 'Remove');
    await click(removeButtons[0]!);
    await wait(700);
    expect((await loadResumeProfile())?.workExperience.map((job) => job.title)).toEqual(['Software Engineer', '']);
  });

  it('hides the end date for a current job', async () => {
    const endLabels = () => [...view.container.querySelectorAll('label')].filter((l) => l.textContent === 'End').length;
    expect(endLabels()).toBe(1); // only the past job has one
    const currentBoxes = [...view.container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    await click(currentBoxes[1]!);
    expect(endLabels()).toBe(0);
  });

  it('saves straight away if the panel is closed before the pause', async () => {
    await typeInto(field(view.container, 'City'), 'Santa Clara');
    window.dispatchEvent(new Event('pagehide'));
    await passTime(0, async () => {});
    expect((await loadResumeProfile())?.personal.address.city).toBe('Santa Clara');
  });

  it('lets the user dismiss a warning', async () => {
    await view.unmount();
    const withWarning = structuredClone(ALEX_RIVERA_EXPECTED);
    withWarning.meta.warnings = ['Removed the email address: it was not found in the resume. Please add it.'];
    view = await render(<ResumeEditor initial={withWarning} />);

    await click(button(view.container, 'Dismiss'));
    expect(view.container.textContent).not.toContain('Removed the email');
    await wait(700);
    expect((await loadResumeProfile())?.meta.warnings).toEqual([]);
  });
});
