import { cleanText, deepQueryAll, isVisible } from '@/src/scanner/dom';
import { FIELD_ID_ATTR } from '@/src/scanner/scan';
import type { FieldDescriptor } from '@/src/scanner/types';
import { matchOption, normalize } from '@/src/shared/match-option';
import { waitFor, waitForQuiet } from '@/src/shared/wait';
import { blur, focus, pressKey, realClick, setNativeValue, typeLikeKeyboard } from './events';

// Puts a value into one field, the way a person would, then reads it back to check it stuck.

export type FillOutcome = { ok: true; value: string } | { ok: false; reason: string; options?: string[] };

const fail = (reason: string, options?: string[]): FillOutcome => ({ ok: false, reason, options });

export function elementFor(field: FieldDescriptor): HTMLElement | null {
  return deepQueryAll<HTMLElement>(document, `[${FIELD_ID_ATTR}="${CSS.escape(field.id)}"]`)[0] ?? null;
}

export async function fillField(field: FieldDescriptor, value: string, file?: File): Promise<FillOutcome> {
  const element = elementFor(field);
  if (!element) return fail('The field is no longer on the page.');
  try {
    switch (field.type) {
      case 'text':
      case 'textarea':
        return fillText(element as HTMLInputElement, value);
      case 'select':
        return element.tagName === 'SELECT' ? fillNativeSelect(element as HTMLSelectElement, value) : await fillDropdown(element, value);
      case 'prompt':
        return await fillPrompt(element as HTMLInputElement, value);
      case 'radio':
        return fillRadio(element as HTMLInputElement, value);
      case 'checkbox':
        return fillCheckbox(element as HTMLInputElement, value === 'true');
      case 'date':
        return fillDate(element, value);
      case 'file':
        return file ? await fillFile(element as HTMLInputElement, file) : fail('No file to upload.');
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unexpected error while filling.');
  }
}

// --- text ---

function fillText(input: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome {
  // Workday may reformat (e.g. phone numbers), so compare letters/digits only.
  const stuck = () => normalize(input.value) === normalize(value);
  focus(input);
  setNativeValue(input, value);
  blur(input);
  if (!stuck()) typeLikeKeyboard(input, value);
  return stuck() ? { ok: true, value: input.value } : fail(`The box shows "${input.value}" instead.`);
}

// --- drop-downs ---

function fillNativeSelect(select: HTMLSelectElement, value: string): FillOutcome {
  const options = [...select.options].map((o) => cleanText(o.textContent));
  const match = matchOption(value, options);
  const option = [...select.options].find((o) => cleanText(o.textContent) === match);
  if (!option) return fail(`"${value}" is not one of the choices.`, options);
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: cleanText(option.textContent) };
}

const OPTION_SELECTOR = '[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]';

/** Shown on screen: has a size and isn't display:none (popups may sit under aria-hidden wrappers, so ignore those). */
const onScreen = (el: Element) => el.getClientRects().length > 0 || !navigator.userAgent.includes('Chrome');

/** The list that a Workday drop-down or search box opened (it is attached at the end of the page). */
function openList(trigger: Element): HTMLElement | null {
  const controls = trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns');
  const byId = controls ? document.getElementById(controls) : null;
  if (byId && onScreen(byId) && byId.querySelector(OPTION_SELECTOR)) return byId;
  const lists = deepQueryAll<HTMLElement>(document, '[role="listbox"], [data-automation-id*="popup" i], [data-automation-id*="dropdown" i]').filter(
    (list) => onScreen(list) && list.querySelector(OPTION_SELECTOR),
  );
  if (lists.length > 0) return lists.at(-1)!;
  // Last resort: options are on screen but their container isn't marked as a list.
  const looseOption = deepQueryAll<HTMLElement>(document, OPTION_SELECTOR).find((o) => onScreen(o) && cleanText(o.textContent));
  return looseOption?.parentElement ?? null;
}

const optionElements = (list: Element) =>
  [...list.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].filter((option) => onScreen(option) && cleanText(option.textContent));

/** Opens a drop-down: a click first, then the keys Workday also listens to. */
async function openDropdown(trigger: HTMLElement): Promise<HTMLElement | null> {
  const attempts: Array<() => void> = [
    () => realClick(trigger),
    () => {
      focus(trigger);
      pressKey(trigger, 'ArrowDown');
    },
    () => pressKey(trigger, 'Enter'),
    () => pressKey(trigger, ' '),
  ];
  for (const attempt of attempts) {
    attempt();
    const list = await waitFor(() => openList(trigger), { what: 'the drop-down list', timeoutMs: 1_500 }).catch(() => null);
    if (list) return list;
  }
  return null;
}

const shownValue = (trigger: Element) => cleanText(trigger.tagName === 'INPUT' ? (trigger as HTMLInputElement).value : trigger.textContent);

const optionText = (option: Element) => cleanText(option.getAttribute('aria-label') ?? option.textContent);

/** The element that scrolls a list: the list itself, something inside it, or a box around it. */
function scrollerOf(list: HTMLElement): HTMLElement | null {
  const scrolls = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY);
  if (scrolls(list)) return list;
  const inside = [...list.querySelectorAll<HTMLElement>('*')].find(scrolls);
  if (inside) return inside;
  for (let el = list.parentElement; el && el !== document.body; el = el.parentElement) if (scrolls(el)) return el;
  return null;
}

/**
 * Finds the option matching `wanted`. Long Workday lists only draw the options in view,
 * so this scrolls down step by step until the option appears or the list ends.
 */
async function findOption(list: HTMLElement, wanted: string): Promise<{ option: HTMLElement | null; seen: string[] }> {
  const seen = new Set<string>();
  for (let step = 0; step < 60; step++) {
    const options = optionElements(list);
    options.forEach((o) => seen.add(optionText(o)));
    const match = matchOption(wanted, options.map(optionText));
    const option = options.find((o) => optionText(o) === match);
    if (option) return { option, seen: [...seen] };

    const scroller = scrollerOf(list);
    if (!scroller) break;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + Math.max(scroller.clientHeight * 0.8, 80);
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    if (scroller.scrollTop === before) break; // reached the end
    await waitForQuiet({ quietMs: 150, timeoutMs: 1_500 });
  }
  // Nothing matched while scrolling: pick from everything we saw (there could be one fuzzy match).
  return { option: null, seen: [...seen] };
}

/** All option texts in a list, scrolling through long lists (capped). */
async function readAllOptions(list: HTMLElement): Promise<string[]> {
  const seen = new Set<string>();
  for (let step = 0; step < 40 && seen.size < 400; step++) {
    optionElements(list).forEach((o) => seen.add(optionText(o)));
    const scroller = scrollerOf(list);
    if (!scroller) break;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + Math.max(scroller.clientHeight * 0.8, 80);
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    if (scroller.scrollTop === before) break;
    await waitForQuiet({ quietMs: 150, timeoutMs: 1_500 });
  }
  return [...seen];
}

/** Opens a search-style list without typing (e.g. Degree), reads all its choices, and closes it. */
export async function readPromptOptions(field: FieldDescriptor): Promise<string[]> {
  const input = elementFor(field) as HTMLInputElement | null;
  if (!input || field.type !== 'prompt') return field.options;
  const list = await openDropdown(input);
  const options = list ? await readAllOptions(list) : [];
  pressKey(list ?? input, 'Escape');
  await waitFor(() => !openList(input), { what: 'the list to close', timeoutMs: 1_500 }).catch(() => null);
  return options;
}

/** Opens a Workday drop-down, reads its choices, and closes it again. Used by the Mapper. */
export async function readDropdownOptions(field: FieldDescriptor): Promise<string[]> {
  const element = elementFor(field);
  if (!element || field.type !== 'select') return field.options;
  if (element.tagName === 'SELECT') return field.options;
  const list = await openDropdown(element);
  const options = list ? await readAllOptions(list) : [];
  pressKey(list ?? element, 'Escape');
  await waitFor(() => !openList(element), { what: 'the list to close', timeoutMs: 1_500 }).catch(() => realClick(element));
  return options;
}

async function fillDropdown(button: HTMLElement, value: string): Promise<FillOutcome> {
  if (normalize(shownValue(button)) === normalize(value)) return { ok: true, value };
  const list = await openDropdown(button);
  if (!list) return fail('The drop-down list did not open.');
  const { option, seen } = await findOption(list, value);
  if (!option) {
    pressKey(list, 'Escape');
    return fail(`"${value}" is not one of the choices.`, seen);
  }
  const match = optionText(option);
  realClick(option);
  const shows = () => normalize(shownValue(button)).includes(normalize(match));
  if (!(await waitFor(shows, { what: 'the choice to show', timeoutMs: 3_000 }).catch(() => false))) {
    // Some lists pick on Enter rather than click.
    focus(option);
    pressKey(option, 'Enter');
    if (!(await waitFor(shows, { what: 'the choice to show', timeoutMs: 2_000 }).catch(() => false))) {
      return fail(`Picked "${match}" but the box still shows "${shownValue(button)}".`);
    }
  }
  return { ok: true, value: match };
}

// --- search-as-you-type ("prompt") boxes, e.g. Skills, Field of Study, How Did You Hear ---

/** The question's box around a search input. */
const promptBox = (input: Element) =>
  input.closest('[data-automation-id^="formField"]') ?? input.parentElement?.parentElement?.parentElement ?? input;

/** Picked items ("chips") shown in the question's box. */
const chipsNear = (input: Element) =>
  [...promptBox(input).querySelectorAll('[data-automation-id="selectedItem"], [data-automation-id*="selectedItem" i], [role="listitem"]')].map((chip) =>
    cleanText(chip.textContent),
  );

/** Workday's own counter, e.g. "2 items selected" (null if the page doesn't show one). */
function selectedCount(input: Element): number | null {
  const match = cleanText(promptBox(input).textContent).match(/(\d+)\s+items?\s+selected/i);
  return match ? Number(match[1]) : null;
}

/**
 * Puts search text into the box the way typing does, without leaving the box.
 * Never used to empty the box: in Workday, deleting in an empty search box removes the last picked item.
 */
function typeSearch(input: HTMLInputElement, text: string): void {
  focus(input);
  if (input.value) input.select?.(); // replace leftover search text only
  const inserted = document.execCommand?.('insertText', false, text);
  if (!inserted || input.value !== text) setNativeValue(input, text);
}

/** Clears leftover search text (not picked items) without a delete keystroke. */
function clearSearchText(input: HTMLInputElement): void {
  if (input.value) setNativeValue(input, '');
}

async function fillPrompt(input: HTMLInputElement, value: string): Promise<FillOutcome> {
  const same = (a: string, b: string) => normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));
  if (chipsNear(input).some((chip) => same(chip, value))) return { ok: true, value };

  const countBefore = selectedCount(input);
  const chipsBefore = chipsNear(input).length;
  const picked = (match: string) =>
    chipsNear(input).some((chip) => same(chip, match)) ||
    chipsNear(input).length > chipsBefore ||
    (countBefore !== null && (selectedCount(input) ?? 0) > countBefore);

  // Two ways in: search by typing (suggestions appear as you type, or after Enter),
  // then, if that finds nothing, the full list (some questions are "scroll and pick").
  const searches: Array<() => Promise<HTMLElement | null>> = [
    async () => {
      focus(input);
      typeSearch(input, value);
      // Suggestions may appear while typing; let the list settle before reading it (an earlier list may still be open).
      await waitForQuiet({ quietMs: 500, timeoutMs: 3_000 });
      const listed = openList(input);
      if (listed && optionElements(listed).some((o) => matchOption(value, [optionText(o)]))) return listed;
      // Workday's search runs on Enter.
      pressKey(input, 'Enter');
      await waitFor(() => openList(input), { what: 'search results', timeoutMs: 5_000 }).catch(() => null);
      await waitForQuiet({ quietMs: 400, timeoutMs: 3_000 });
      return openList(input);
    },
    async () => {
      pressKey(input, 'Escape');
      clearSearchText(input);
      return openDropdown(input);
    },
  ];

  let seen: string[] = [];
  for (const search of searches) {
    let list = await search();
    // Lists can be nested (a category, then its items): follow up to 3 levels.
    for (let level = 0; list && level < 3; level++) {
      const found = await findOption(list, value);
      seen = found.seen;
      let option = found.option;
      // A single result is taken only if it is clearly the same thing ("LinkedIn" → "LinkedIn Job Posting").
      const only = optionElements(list);
      if (!option && only.length === 1 && same(optionText(only[0]!), value)) option = only[0]!;
      if (!option) break;

      const match = optionText(option);
      realClick(option);
      const done = await waitFor(() => picked(match) || (openList(input) && openList(input) !== list ? 'next-level' : null), {
        what: 'the pick to show',
        timeoutMs: 3_000,
      }).catch(() => null);
      if (picked(match)) {
        // Leave the box as it is: the next item (e.g. the next skill) is simply typed in.
        await waitForQuiet({ quietMs: 300, timeoutMs: 2_000 });
        return { ok: true, value: match };
      }
      list = done === 'next-level' ? openList(input) : null;
    }
  }
  pressKey(input, 'Escape');
  clearSearchText(input);
  return fail(`Could not find "${value}" in the list.`, seen.slice(0, 60));
}

// --- radio buttons and checkboxes ---

function fillRadio(anyRadio: HTMLInputElement, value: string): FillOutcome {
  const group = anyRadio.name
    ? deepQueryAll<HTMLInputElement>(document, `input[type="radio"][name="${CSS.escape(anyRadio.name)}"]`)
    : [...(anyRadio.closest('fieldset, [role="radiogroup"]')?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [anyRadio])];
  const labelOf = (radio: HTMLInputElement) => cleanText(radio.closest('label')?.textContent ?? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)?.textContent ?? radio.value);
  const labels = group.map(labelOf);
  const match = matchOption(value, labels);
  const radio = group.find((r) => labelOf(r) === match);
  if (!radio) return fail(`"${value}" is not one of the choices.`, labels);
  if (!radio.checked) realClick(radio);
  return radio.checked ? { ok: true, value: match! } : fail('The choice did not stick.');
}

function fillCheckbox(checkbox: HTMLInputElement, checked: boolean): FillOutcome {
  if (checkbox.checked !== checked) realClick(checkbox);
  return checkbox.checked === checked ? { ok: true, value: String(checked) } : fail('The tick box did not change.');
}

// --- dates (Workday splits them into month / day / year boxes) ---

function fillDate(group: HTMLElement, value: string): FillOutcome {
  // value is "MM/YYYY" or "MM/DD/YYYY" or "YYYY"
  const parts = value.split('/');
  const wanted: Record<string, string | undefined> =
    parts.length === 3 ? { Month: parts[0], Day: parts[1], Year: parts[2] } : parts.length === 2 ? { Month: parts[0], Year: parts[1] } : { Year: parts[0] };
  const inputs = [...group.querySelectorAll<HTMLInputElement>('input')];
  if (inputs.length === 0 && group instanceof HTMLInputElement) return fillText(group, value);

  for (const input of inputs) {
    const part = (input.getAttribute('data-automation-id') ?? input.getAttribute('aria-label') ?? '').match(/Month|Day|Year/i)?.[0];
    const partValue = part ? wanted[part[0]!.toUpperCase() + part.slice(1).toLowerCase()] : undefined;
    if (!partValue) continue;
    realClick(input);
    focus(input);
    input.select?.();
    if (!document.execCommand?.('insertText', false, partValue) || Number(input.value) !== Number(partValue)) setNativeValue(input, partValue);
  }
  leaveField(group);
  const shown = inputs.map((input) => input.value).filter(Boolean).join('/');
  const digits = (text: string) => text.replace(/\D/g, '').replace(/^0+/, '');
  return digits(shown) === digits(value) ? { ok: true, value: shown } : fail(`The date shows "${shown}" instead.`);
}

/**
 * Moves focus out of a widget the way clicking elsewhere does. Workday saves some widgets
 * (dates especially) only when focus leaves them; until then it treats them as empty.
 */
function leaveField(widget: HTMLElement): void {
  const active = document.activeElement as HTMLElement | null;
  if (active && widget.contains(active)) {
    active.dispatchEvent(new FocusEvent('blur', { relatedTarget: document.body }));
    active.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    active.blur();
  }
  // A click on an empty part of the page, like a person clicking away.
  const init = { bubbles: true, cancelable: true, view: window };
  document.body.dispatchEvent(new MouseEvent('mousedown', init));
  document.body.dispatchEvent(new MouseEvent('mouseup', init));
  document.body.dispatchEvent(new MouseEvent('click', init));
}

// --- file upload ---

async function fillFile(input: HTMLInputElement, file: File): Promise<FillOutcome> {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // Workday shows the file name once the upload is accepted.
  const container = input.closest('[data-automation-id^="formField"]') ?? input.parentElement?.parentElement ?? document.body;
  const shown = await waitFor(() => container.textContent?.includes(file.name), { what: 'the uploaded file', timeoutMs: 20_000 }).catch(() => false);
  return shown ? { ok: true, value: file.name } : fail('The upload did not show on the page.');
}
