import { cleanText, deepQueryAll, isVisible } from '@/src/scanner/dom';
import { pageInfo } from '@/src/scanner/snapshot';
import { waitFor } from '@/src/shared/wait';
import { realClick } from '@/src/filler/events';

// Knows where we are in the Workday flow and how to move forward.

// job = the job posting (Apply button) or the "how do you want to apply" choice.
export type PageKind = 'job' | 'signin' | 'form' | 'review' | 'done';

const visibleButtons = () =>
  deepQueryAll<HTMLElement>(document, 'button, [role="button"], a[data-automation-id]').filter((b) => isVisible(b));
const buttonText = (b: Element) => cleanText(b.textContent || b.getAttribute('aria-label'));

export function detectPageKind(): PageKind {
  const { title } = pageInfo();
  // innerText = only what a person can see (textContent would include script code).
  const body = cleanText(document.body.innerText ?? document.body.textContent).toLowerCase();
  if (/application (has been )?(submitted|received)|thank you for applying|successfully submitted|congratulations.{0,40}appl/.test(body)) return 'done';

  const automationIds = visibleButtons().map((b) => b.getAttribute('data-automation-id') ?? '');
  const hasPassword = deepQueryAll(document, 'input[type="password"]').some((el) => isVisible(el));
  if (hasPassword || /sign ?in|create account|verify (your )?email/i.test(title) || automationIds.some((id) => /SignInWith|signInSubmit|createAccount/i.test(id))) {
    return 'signin';
  }
  if (/review/i.test(title) || visibleButtons().some((b) => /^submit( application)?$/i.test(buttonText(b)))) return 'review';
  if (findStartButton()) return 'job';
  return 'form';
}

/** On a job posting: "Apply". On the apply-choice dialog: "Apply Manually" (we fill from the profile ourselves). */
export function findStartButton(): HTMLElement | null {
  const buttons = visibleButtons();
  return (
    buttons.find((b) => /applyManually/i.test(b.getAttribute('data-automation-id') ?? '') || /^apply manually$/i.test(buttonText(b))) ??
    buttons.find((b) => /adventureButton/i.test(b.getAttribute('data-automation-id') ?? '') || /^apply( now)?$/i.test(buttonText(b))) ??
    null
  );
}

export function findNextButton(): HTMLElement | null {
  const buttons = visibleButtons().filter((b) => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true');
  return (
    buttons.find((b) => /next|continue/i.test(b.getAttribute('data-automation-id') ?? '')) ??
    buttons.find((b) => /^(save and continue|next|continue)$/i.test(buttonText(b))) ??
    null
  );
}

export function findSubmitButton(): HTMLElement | null {
  return visibleButtons().find((b) => /^submit( application)?$/i.test(buttonText(b))) ?? null;
}

/** Error messages Workday shows after Next (e.g. "The field First Name is required"). */
export function visibleErrors(): string[] {
  const nodes = deepQueryAll(document, '[role="alert"], [data-automation-id*="errorMessage" i], [data-automation-id*="error-message" i]');
  return [...new Set(nodes.filter((n) => isVisible(n)).map((n) => cleanText(n.textContent)).filter(Boolean))].slice(0, 10);
}

export type AdvanceResult = { moved: true } | { moved: false; errors: string[]; reason: string };

/** Clicks Next and waits until the step changes, or errors appear. */
export async function goToNextPage(): Promise<AdvanceResult> {
  const next = findNextButton();
  if (!next) return { moved: false, errors: [], reason: 'No Next / Save and Continue button found on this page.' };
  const before = pageInfo();
  realClick(next);
  const outcome = await waitFor(
    () => {
      const now = pageInfo();
      if (now.title !== before.title || now.step !== before.step || now.url !== before.url) return 'moved';
      if (visibleErrors().length > 0) return 'errors';
      return null;
    },
    { what: 'the next page', timeoutMs: 20_000 },
  ).catch(() => 'timeout' as const);
  if (outcome === 'moved') return { moved: true };
  return { moved: false, errors: visibleErrors(), reason: outcome === 'errors' ? 'Workday shows errors on this page.' : 'The page did not change after clicking Next.' };
}
