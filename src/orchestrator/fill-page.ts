import { elementFor, fillField, readDropdownOptions, type FillOutcome } from '@/src/filler/fill';
import { realClick } from '@/src/filler/events';
import { mapFields } from '@/src/mapper/map';
import { sendToBackground } from '@/src/messaging/messages';
import { detectPageKind, findNextButton, findStartButton, goToNextPage, visibleErrors } from '@/src/navigator/page';
import { loadAnswersProfile, loadResumeProfile } from '@/src/profile/storage';
import { cleanText, deepQueryAll, isVisible } from '@/src/scanner/dom';
import { scanPage } from '@/src/scanner/scan';
import { pageInfo } from '@/src/scanner/snapshot';
import type { FieldDescriptor } from '@/src/scanner/types';
import { waitFor, waitForQuiet } from '@/src/shared/wait';
import { recordPage, runState, updateRun, type FieldReport, type PageReport } from './run-state';

// The Orchestrator: fills one page, or walks through all pages until Review.

const MAX_PASSES = 3; // new questions can appear after answering one; re-scan up to this many times
const MAX_PAGES = 12;

/** Fills every field it can on the current page and returns what it did. */
export async function fillCurrentPage(): Promise<PageReport> {
  const kind = detectPageKind();
  const page = pageInfo();
  if (kind !== 'form') return { page, kind, fields: [] };

  const profile = await loadResumeProfile();
  if (!profile) throw new Error('Upload your resume in the Resume tab first.');
  const answers = await loadAnswersProfile();

  // Repeatable sections: make sure there is one entry per job / school.
  await ensureEntries(/work experience/i, profile.workExperience.length);
  await ensureEntries(/education/i, profile.education.length);

  const reports = new Map<string, FieldReport>();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if ((await runState.getValue()).stopRequested) break;
    const fields = scanPage().filter((f) => !reports.has(f.id));
    if (fields.length === 0) break;

    // Workday drop-downs only show their choices when opened: read them so answers can be checked.
    for (const field of fields) {
      if (field.type === 'select' && !field.currentValue && field.options.length === 0) {
        field.options = await readDropdownOptions(field);
      }
    }

    const decisions = await mapFields(fields, profile, answers, askAi);
    for (const decision of decisions) {
      const field = fields.find((f) => f.id === decision.fieldId)!;
      const report: FieldReport = { ...decision };
      reports.set(field.id, report);
      if (decision.status !== 'fill' || decision.value === null) continue;
      if ((await runState.getValue()).stopRequested) break;

      const outcome = await fillOne(field, decision.value);
      report.outcome = outcome.ok ? 'filled' : 'failed';
      report.shownValue = outcome.ok ? outcome.value : undefined;
      if (!outcome.ok) report.outcomeNote = outcome.options?.length ? `${outcome.reason} Choices: ${outcome.options.slice(0, 8).join(', ')}` : outcome.reason;
    }
    await waitForQuiet({ quietMs: 300, timeoutMs: 3_000 });
  }

  const result: PageReport = { page, kind, fields: [...reports.values()] };
  await recordPage(result);
  return result;
}

async function askAi(fields: FieldDescriptor[]) {
  const result = await sendToBackground({ type: 'mapFields', fields });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

async function fillOne(field: FieldDescriptor, value: string | string[]): Promise<FillOutcome> {
  if (field.type === 'file') return uploadResume(field);
  if (Array.isArray(value)) {
    // Multi-pick search box (e.g. skills): add them one at a time; report how many stuck.
    const added: string[] = [];
    for (const item of value) {
      const outcome = await fillField(field, item);
      if (outcome.ok) added.push(outcome.value);
    }
    return added.length ? { ok: true, value: added.join(', ') } : { ok: false, reason: 'None of the items could be added.' };
  }
  return fillField(field, value);
}

async function uploadResume(field: FieldDescriptor): Promise<FillOutcome> {
  const result = await sendToBackground({ type: 'getResumeFile' });
  if (!result.ok || !result.data) return { ok: false, reason: 'No resume file saved. Upload it in the Resume tab.' };
  const { name, mimeType, base64 } = result.data;
  const container = elementFor(field)?.closest('[data-automation-id^="formField"]') ?? document.body;
  if (container.textContent?.includes(name)) return { ok: true, value: name }; // already uploaded
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return fillField(field, name, new File([bytes], name, { type: mimeType }));
}

/** Clicks "Add" in a repeatable section (Work Experience, Education) until there are `wanted` entries. */
async function ensureEntries(section: RegExp, wanted: number): Promise<void> {
  const headings = () => deepQueryAll(document, 'h2, h3, h4, [role="heading"]').filter((h) => isVisible(h));
  const sectionHeading = () => headings().find((h) => section.test(cleanText(h.textContent)) && !/\d\s*$/.test(cleanText(h.textContent)));
  const entryCount = () => headings().filter((h) => new RegExp(`${section.source}\\s*\\d+\\s*$`, 'i').test(cleanText(h.textContent))).length;

  for (let attempt = 0; attempt < 10 && entryCount() < wanted; attempt++) {
    const start = sectionHeading();
    if (!start) return; // this page has no such section
    const addButton = addButtonAfter(start, headings());
    if (!addButton) return;
    const before = entryCount();
    realClick(addButton);
    await waitFor(() => entryCount() > before, { what: 'a new entry', timeoutMs: 5_000 }).catch(() => null);
  }
}

/** The "Add" / "Add Another" button between a section heading and the next top-level section. */
function addButtonAfter(heading: Element, allHeadings: Element[]): HTMLElement | null {
  const level = heading.tagName;
  const nextSection = allHeadings.find(
    (h) => h !== heading && h.tagName === level && heading.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING && !/\d\s*$/.test(cleanText(h.textContent)),
  );
  const buttons = deepQueryAll<HTMLElement>(document, 'button, [role="button"]').filter((b) => {
    if (!isVisible(b) || !/^add( another)?\b/i.test(cleanText(b.textContent || b.getAttribute('aria-label')))) return false;
    const afterHeading = heading.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    const beforeNext = !nextSection || b.compareDocumentPosition(nextSection) & Node.DOCUMENT_POSITION_FOLLOWING;
    return afterHeading && beforeNext;
  });
  return buttons.at(-1) ?? null;
}

/** Waits until a freshly loaded Workday page has drawn its content (it renders after load). */
async function pageReady(): Promise<void> {
  await waitFor(() => detectPageKind() !== 'form' || scanPage().length > 0 || findNextButton(), { what: 'the page to load', timeoutMs: 20_000 }).catch(() => null);
  await waitForQuiet({ quietMs: 500, timeoutMs: 5_000 });
}

const RESUME_WINDOW_MS = 10 * 60_000;

/**
 * Called when the content script starts on a new page. Some Workday steps (e.g. "Apply Manually",
 * signing in) do a full page load, which ends the old script; if a run was active, continue it here.
 */
export async function resumeRunAfterLoad(): Promise<boolean> {
  const state = await runState.getValue();
  const active = (state.status === 'running' || state.status === 'awaiting_auth') && !state.stopRequested;
  if (!active || Date.now() - state.updatedAt > RESUME_WINDOW_MS) return false;
  await pageReady();
  await runAllPages({ resumed: true });
  return true;
}

/** Fills page after page until sign-in, a problem, or the Review page. Never submits. */
export async function runAllPages({ resumed = false } = {}): Promise<void> {
  await updateRun({ status: 'running', message: resumed ? 'Continuing on the new page…' : 'Starting…', ...(resumed ? {} : { stopRequested: false }) });
  for (let i = 0; i < MAX_PAGES; i++) {
    if ((await runState.getValue()).stopRequested) {
      await updateRun({ status: 'stopped', message: 'Stopped. Press "Fill all pages" to continue.' });
      return;
    }
    const kind = detectPageKind();
    if (kind === 'job') {
      // Job posting → Apply → Apply Manually. These open the application; no sign-in is touched.
      const start = findStartButton()!;
      await updateRun({ message: `Clicking "${cleanText(start.textContent)}"…` });
      realClick(start);
      await waitFor(() => findStartButton() !== start || detectPageKind() !== 'job', { what: 'the application to open', timeoutMs: 15_000 }).catch(() => null);
      await waitForQuiet({ quietMs: 500, timeoutMs: 10_000 });
      continue;
    }
    if (kind === 'signin') {
      // Hard Rule 2: never touch sign-in. Wait for the user; continue once the page is past it.
      // (If signing in reloads the page, resumeRunAfterLoad picks the run up instead.)
      await updateRun({ status: 'awaiting_auth', message: 'Please sign in or create your account on the page. FormPilot will continue by itself afterwards.' });
      const signedIn = await waitFor(() => detectPageKind() !== 'signin', { what: 'sign-in', timeoutMs: 15 * 60_000 }).catch(() => false);
      if (!signedIn) return;
      await updateRun({ status: 'running', message: 'Signed in. Continuing…' });
      await pageReady();
      continue;
    }
    if (kind === 'review') {
      await updateRun({ status: 'review', message: 'Reached the Review page. Check everything below, then confirm to submit.' });
      return;
    }
    if (kind === 'done') {
      await updateRun({ status: 'done', message: 'The application has been submitted.' });
      return;
    }

    await updateRun({ message: `Filling "${pageInfo().title}"…` });
    const report = await fillCurrentPage();
    const needsUser = report.fields.filter((f) => f.status === 'flag' || f.outcome === 'failed');
    const requiredMissing = needsUser.filter((f) => scanPage().some((s) => s.id === f.fieldId && s.required && !s.currentValue));
    if (requiredMissing.length > 0) {
      await updateRun({
        status: 'needs_user',
        message: `Please fill ${requiredMissing.length} required field(s) on "${report.page.title}" yourself, then press "Fill all pages" again.`,
      });
      return;
    }

    await updateRun({ message: `Going to the next page…` });
    const moved = await goToNextPage();
    if (!moved.moved) {
      await updateRun({ status: 'needs_user', message: `${moved.reason} ${moved.errors.join(' · ')}`.trim() });
      return;
    }
    await waitForQuiet({ quietMs: 500, timeoutMs: 10_000 });
  }
  await updateRun({ status: 'needs_user', message: 'Stopped after many pages without reaching Review.' });
}

/** Fills one field with a value the user accepted in the side panel, and updates the report. */
export async function useSuggestion(fieldId: string, value: string): Promise<{ filled: boolean; note: string }> {
  const field = scanPage().find((f) => f.id === fieldId);
  if (!field) return { filled: false, note: 'That field is no longer on this page.' };
  const outcome = await fillField(field, value);
  const state = await runState.getValue();
  const pages = state.pages.map((p) => ({
    ...p,
    fields: p.fields.map((f) =>
      f.fieldId === fieldId
        ? { ...f, status: 'fill' as const, source: 'user' as const, outcome: outcome.ok ? ('filled' as const) : ('failed' as const), shownValue: outcome.ok ? outcome.value : undefined, outcomeNote: outcome.ok ? undefined : outcome.reason }
        : f,
    ),
  }));
  await updateRun({ pages });
  return outcome.ok ? { filled: true, note: '' } : { filled: false, note: outcome.reason };
}

/** Clicks Submit. Only ever called after the user presses "Confirm and submit" in the side panel (Hard Rule 1). */
export async function submitApplication(): Promise<void> {
  if (detectPageKind() !== 'review') {
    await updateRun({ status: 'needs_user', message: 'Submit is only allowed from the Review page.' });
    return;
  }
  const submit = deepQueryAll<HTMLElement>(document, 'button').find((b) => isVisible(b) && /^submit( application)?$/i.test(cleanText(b.textContent)));
  if (!submit) {
    await updateRun({ status: 'needs_user', message: 'Could not find the Submit button. Please submit on the page.' });
    return;
  }
  await updateRun({ status: 'submitting', message: 'Submitting…' });
  realClick(submit);
  const done = await waitFor(() => detectPageKind() === 'done' || visibleErrors().length > 0, { what: 'submission', timeoutMs: 30_000 }).catch(() => false);
  await updateRun(
    done && detectPageKind() === 'done'
      ? { status: 'done', message: 'Application submitted.' }
      : { status: 'needs_user', message: `Please check the page. ${visibleErrors().join(' · ')}`.trim() },
  );
}
