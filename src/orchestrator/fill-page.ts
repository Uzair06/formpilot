import { elementFor, fillField, readDropdownOptions, readPromptOptions, type FillOutcome } from '@/src/filler/fill';
import { realClick } from '@/src/filler/events';
import { mapFields } from '@/src/mapper/map';
import { sendToBackground } from '@/src/messaging/messages';
import { detectPageKind, findStartButton, goToNextPage, pageReady, visibleErrors } from '@/src/navigator/page';
import { loadAnswersProfile, loadResumeProfile } from '@/src/profile/storage';
import { cleanText, deepQueryAll, isVisible } from '@/src/scanner/dom';
import { scanPage } from '@/src/scanner/scan';
import { pageInfo } from '@/src/scanner/snapshot';
import type { FieldDescriptor } from '@/src/scanner/types';
import { waitFor, waitForQuiet } from '@/src/shared/wait';
import { websiteLinks } from '@/src/mapper/rules';
import { EDUCATION, ensureEntries, labelRepeatSections, WEBSITES, WORK } from './repeat-sections';
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
  await ensureEntries(WORK, profile.workExperience.length);
  await ensureEntries(EDUCATION, profile.education.length);
  await ensureEntries(WEBSITES, websiteLinks(profile).length);

  const reports = new Map<string, FieldReport>();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if ((await runState.getValue()).stopRequested) break;
    const scanned = scanPage();
    labelRepeatSections(scanned); // "Work Experience 2" etc., from the page structure
    const fields = scanned.filter((f) => !reports.has(f.id));
    if (fields.length === 0) break;

    // Workday drop-downs only show their choices when opened: read them so answers can be checked.
    for (const field of fields) {
      if (field.currentValue || field.options.length > 0) continue;
      if (field.type === 'select') field.options = await readDropdownOptions(field);
      // Search-style lists whose answer must be one of their options (e.g. Degree). Not free-search
      // boxes like Skills or Field of Study, which are matched by searching instead.
      else if (field.type === 'prompt' && /degree|level of education|qualification/i.test(field.label)) field.options = await readPromptOptions(field);
    }

    const decisions = await mapFields(fields, profile, answers, askAi);
    for (const decision of decisions) {
      const field = fields.find((f) => f.id === decision.fieldId)!;
      const report: FieldReport = { ...decision };
      reports.set(field.id, report);
      if (decision.status !== 'fill' || decision.value === null) continue;
      if ((await runState.getValue()).stopRequested) break;

      let outcome = await fillOne(field, decision.value);
      // Recovery: our value wasn't in the list, but now we know the real options (e.g. "Computer Science
      // and Engineering" vs "Computer Science"). Ask the AI to pick one of them. Never for Answers/EEO values.
      if (!outcome.ok && outcome.options?.length && decision.source !== 'answers' && typeof decision.value === 'string') {
        const retry = await pickFromSeenOptions(field, outcome.options);
        if (retry) {
          outcome = await fillOne(field, retry.value);
          if (outcome.ok) Object.assign(report, { source: 'ai', confidence: retry.confidence, reason: `${decision.reason} → closest option (AI)` });
        }
      }
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

/**
 * Workday marked some fields with an error. Optional ones (no required star) are not worth stopping
 * for: clear them so the page can be saved. Returns true if anything was cleared.
 */
async function clearRejectedOptionalFields(): Promise<boolean> {
  let cleared = false;
  const fields = scanPage();
  for (const field of fields) {
    if (field.required || !field.currentValue) continue;
    const element = elementFor(field);
    const box = element?.closest('[data-automation-id^="formField"]') ?? element?.parentElement;
    const hasError = box && deepQueryAll(box, '[role="alert"], [aria-invalid="true"], [data-automation-id*="error" i]').some((el) => isVisible(el) || el.getAttribute('aria-invalid') === 'true');
    if (!hasError || !element) continue;
    if (field.type === 'text' || field.type === 'textarea') {
      await fillField(field, '');
      cleared = true;
    } else if (field.type === 'date') {
      element.querySelectorAll<HTMLInputElement>('input').forEach((input) => (input.value = ''));
      cleared = true;
    }
    if (cleared) {
      const state = await runState.getValue();
      const pages = state.pages.map((p) => ({
        ...p,
        fields: p.fields.map((f) => (f.fieldId === field.id ? { ...f, outcome: undefined, status: 'skip' as const, reason: 'Optional field Workday rejected — left empty' } : f)),
      }));
      await updateRun({ pages });
    }
  }
  return cleared;
}

/** One small AI call: which of these real options fits this field? Only confident answers are used. */
async function pickFromSeenOptions(field: FieldDescriptor, options: string[]): Promise<{ value: string; confidence: number } | null> {
  try {
    const [answer] = await askAi([{ ...field, type: 'select', options }]);
    if (!answer?.value || answer.confidence < 0.6) return null;
    const option = options.find((o) => o === answer.value) ?? options.find((o) => o.toLowerCase() === answer.value!.toLowerCase());
    return option ? { value: option, confidence: answer.confidence } : null;
  } catch {
    return null;
  }
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

    await pageReady();
    await updateRun({ message: `Filling "${pageInfo().title}"…` });
    const report = await fillCurrentPage();
    if (report.fields.length === 0) {
      // Never press Next on a page we couldn't read: that only produces Workday errors.
      await updateRun({ status: 'needs_user', message: `No fields found on "${report.page.title}" yet. If the page is still loading, wait a moment and press Continue.` });
      return;
    }
    const needsUser = report.fields.filter((f) => f.status === 'flag' || (f.status === 'suggest' && !f.outcome) || f.outcome === 'failed');
    const requiredMissing = needsUser.filter((f) => scanPage().some((s) => s.id === f.fieldId && s.required && !s.currentValue));
    if (requiredMissing.length > 0) {
      await updateRun({
        status: 'needs_user',
        message: `Please answer on "${report.page.title}": ${requiredMissing.map((f) => (f.label || 'an unlabelled field').replace(/[.:]+$/, '')).join('; ')}. Then press Continue.`,
      });
      return;
    }

    await updateRun({ message: `Going to the next page…` });
    let moved = await goToNextPage();
    if (!moved.moved && moved.errors.length > 0 && (await clearRejectedOptionalFields())) {
      await updateRun({ message: 'Cleared optional fields Workday rejected; trying again…' });
      moved = await goToNextPage();
    }
    if (!moved.moved) {
      await updateRun({ status: 'needs_user', message: `${moved.reason} ${moved.errors.join(' · ')} Fix it on the page, then press Continue.`.trim() });
      return;
    }
    await pageReady();
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
