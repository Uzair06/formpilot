import { cleanText, deepQueryAll, isVisible } from '@/src/scanner/dom';
import { FIELD_ID_ATTR } from '@/src/scanner/scan';
import type { FieldDescriptor } from '@/src/scanner/types';
import { matchOption, normalize } from '@/src/shared/match-option';
import { waitFor, waitForQuiet } from '@/src/shared/wait';
import { blur, focus, pressKey, realClick, setNativeValue } from './events';

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
  focus(input);
  setNativeValue(input, value);
  blur(input);
  // Workday may reformat (e.g. phone numbers), so compare letters/digits only.
  const same = normalize(input.value) === normalize(value);
  return same ? { ok: true, value: input.value } : fail(`The box shows "${input.value}" instead.`);
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

/** The list that a Workday drop-down or search box opened (it is attached at the end of the page). */
function openList(trigger: Element): HTMLElement | null {
  const controls = trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns');
  const byId = controls ? document.getElementById(controls) : null;
  if (byId && isVisible(byId) && byId.querySelector('[role="option"]')) return byId;
  const lists = deepQueryAll<HTMLElement>(document, '[role="listbox"]').filter((list) => isVisible(list) && list.querySelector('[role="option"]'));
  return lists.at(-1) ?? null;
}

const optionElements = (list: Element) =>
  [...list.querySelectorAll<HTMLElement>('[role="option"]')].filter((option) => cleanText(option.textContent));

const optionText = (option: Element) => cleanText(option.getAttribute('aria-label') ?? option.textContent);

/** Opens a Workday drop-down, reads its choices, and closes it again. Used by the Mapper. */
export async function readDropdownOptions(field: FieldDescriptor): Promise<string[]> {
  const element = elementFor(field);
  if (!element || field.type !== 'select') return field.options;
  if (element.tagName === 'SELECT') return field.options;
  realClick(element);
  const list = await waitFor(() => openList(element), { what: `the "${field.label}" list` }).catch(() => null);
  const options = list ? optionElements(list).map(optionText) : [];
  pressKey(list ?? element, 'Escape');
  await waitFor(() => !openList(element), { what: 'the list to close', timeoutMs: 2_000 }).catch(() => null);
  return options;
}

async function fillDropdown(button: HTMLElement, value: string): Promise<FillOutcome> {
  if (normalize(cleanText(button.textContent)) === normalize(value)) return { ok: true, value };
  realClick(button);
  const list = await waitFor(() => openList(button), { what: 'the drop-down list' });
  const options = optionElements(list);
  const match = matchOption(value, options.map(optionText));
  const option = options.find((o) => optionText(o) === match);
  if (!option) {
    pressKey(list, 'Escape');
    return fail(`"${value}" is not one of the choices.`, options.map(optionText));
  }
  realClick(option);
  await waitFor(() => normalize(cleanText(button.textContent)).includes(normalize(match!)), { what: 'the choice to show' });
  return { ok: true, value: match! };
}

// --- search-as-you-type ("prompt") boxes ---

const chipsNear = (input: Element) => {
  const container = input.closest('[data-automation-id^="formField"]') ?? input.parentElement?.parentElement ?? input;
  return [...container.querySelectorAll('[data-automation-id="selectedItem"], [role="listitem"]')].map((chip) => cleanText(chip.textContent));
};

async function fillPrompt(input: HTMLInputElement, value: string): Promise<FillOutcome> {
  const hasChip = () => chipsNear(input).some((chip) => normalize(chip).includes(normalize(value)) || normalize(value).includes(normalize(chip)));
  if (hasChip()) return { ok: true, value };

  focus(input);
  realClick(input);
  setNativeValue(input, value);
  pressKey(input, 'Enter');

  // Some lists are nested (a category, then its items): pick the best match up to 3 levels deep.
  let lastOptions: string[] = [];
  for (let level = 0; level < 3; level++) {
    const list = await waitFor(() => openList(input), { what: 'search results' }).catch(() => null);
    if (!list) break;
    const options = optionElements(list);
    lastOptions = options.map(optionText);
    const match = matchOption(value, lastOptions) ?? (options.length === 1 ? lastOptions[0]! : null);
    const option = options.find((o) => optionText(o) === match);
    if (!option) break;
    realClick(option);
    await waitForQuiet({ quietMs: 250, timeoutMs: 3_000 });
    const chips = chipsNear(input);
    if (chips.length > 0 && (hasChip() || chips.some((chip) => normalize(chip) === normalize(match!)))) return { ok: true, value: match! };
  }
  pressKey(input, 'Escape');
  return fail(`Could not find "${value}" in the search results.`, lastOptions);
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
    focus(input);
    setNativeValue(input, partValue);
    blur(input);
  }
  const shown = inputs.map((input) => input.value).filter(Boolean).join('/');
  const digits = (text: string) => text.replace(/\D/g, '').replace(/^0+/, '');
  return digits(shown) === digits(value) ? { ok: true, value: shown } : fail(`The date shows "${shown}" instead.`);
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
