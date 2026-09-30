import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import App from '@/entrypoints/sidepanel/App';
import { clearResumeFile, saveResumeFile } from '@/src/profile/resume-file';
import { loadResumeProfile, saveResumeProfile } from '@/src/profile/storage';
import { ALEX_RIVERA_EXPECTED } from '../../fixtures/resumes/alex-rivera.expected';
import { button, click, field, passTime, render, typeInto, type Rendered } from './render';

const wait = (ms: number) => passTime(ms, (t) => vi.advanceTimersByTimeAsync(t));
const panel = (view: Rendered, name: string) => view.container.querySelector<HTMLElement>(`#panel-${name}`)!;

describe('side panel App', () => {
  let view: Rendered;

  beforeEach(async () => {
    fakeBrowser.reset();
    await clearResumeFile();
    await saveResumeProfile(ALEX_RIVERA_EXPECTED);
    await saveResumeFile({
      name: 'alex-rivera.pdf',
      mimeType: 'application/pdf',
      bytes: new ArrayBuffer(4),
      text: 'Alex J. Rivera',
      links: [],
      savedAt: 1,
    });
    view = await render(<App />);
    // Let the saved profile, answers and file finish loading.
    await passTime(0, async () => {});
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await view.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('switches between the Resume and Answers tabs', async () => {
    expect(panel(view, 'resume').hidden).toBe(false);
    expect(panel(view, 'answers').hidden).toBe(true);

    await click(view.container.querySelector('#tab-answers')!);
    expect(panel(view, 'resume').hidden).toBe(true);
    expect(panel(view, 'answers').hidden).toBe(false);
  });

  it('shows how many answers are missing on the tab', async () => {
    expect(view.container.querySelector('#tab-answers .badge')?.textContent).toBe('6');
  });

  it('keeps unsaved typing when switching tabs', async () => {
    await typeInto(field(panel(view, 'resume'), 'City'), 'Santa Cl');
    await click(view.container.querySelector('#tab-answers')!);
    await click(view.container.querySelector('#tab-resume')!);
    expect(field(panel(view, 'resume'), 'City').value).toBe('Santa Cl');
  });

  // Regression: a failed "Read again" rebuilt the editor from the old AI profile,
  // so the next edit silently undid earlier edits.
  it('keeps earlier edits when "Read again with AI" fails', async () => {
    await typeInto(field(panel(view, 'resume'), 'City'), 'Santa Clara');
    await wait(700);

    const busyReply = { ok: false, error: { code: 'unavailable', message: 'Gemini is busy.' } };
    vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(busyReply as never); // the fake browser types replies as void
    await click(button(view.container, 'Read again with AI'));
    await click(button(view.container, 'Yes, read again'));
    await passTime(0, async () => {});

    expect(view.container.textContent).toContain('Gemini is busy.');
    expect(field(panel(view, 'resume'), 'City').value).toBe('Santa Clara');

    await typeInto(field(panel(view, 'resume'), 'Postal code'), '95050');
    await wait(700);
    expect((await loadResumeProfile())?.personal.address).toMatchObject({ city: 'Santa Clara', postalCode: '95050' });
  });
});
