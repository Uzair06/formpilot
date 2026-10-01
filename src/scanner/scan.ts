import { cleanText, deepQueryAll, isVisible } from './dom';
import { findGroupLabel, findLabel, isRequired } from './label';
import type { FieldDescriptor, FieldType } from './types';

// Finds every form field on the current page and describes it (label, type, value, options).
// Each element gets a data-formpilot-id so the Filler can find it again later.

export const FIELD_ID_ATTR = 'data-formpilot-id';

// Text shown in an empty Workday drop-down.
const EMPTY_SELECT_TEXT = /^(select one|select|choose one|--)$/i;

// Workday splits dates into month/day/year boxes with these automation ids.
const DATE_PART = /dateSection(Month|Day|Year)/i;

let nextId = 1;
function idFor(element: Element): string {
  let id = element.getAttribute(FIELD_ID_ATTR);
  if (!id) {
    id = `fp-${nextId++}`;
    element.setAttribute(FIELD_ID_ATTR, id);
  }
  return id;
}

function helperTextOf(element: Element): string {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return '';
  const root = element.getRootNode() as Document;
  return cleanText(ids.split(/\s+/).map((id) => root.getElementById(id)?.textContent ?? '').join(' '));
}

function automationIdOf(element: Element): string {
  return element.getAttribute('data-automation-id') ?? element.closest('[data-automation-id]')?.getAttribute('data-automation-id') ?? '';
}

/** The last heading above the element, e.g. "Work Experience 2". */
function sectionOf(element: Element, headings: Element[]): string {
  let section = '';
  for (const heading of headings) {
    if (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) section = cleanText(heading.textContent);
    else break;
  }
  return section;
}

/** The part of the page that holds the application form. */
export function formRoot(doc: Document = document): ParentNode {
  return doc.querySelector('main, [role="main"]') ?? doc.body;
}

export function scanPage(root: ParentNode = formRoot()): FieldDescriptor[] {
  const headings = deepQueryAll(root, 'h1, h2, h3, h4, [role="heading"]');
  const fields: FieldDescriptor[] = [];
  const seenRadioGroups = new Set<string>();
  const seenDateGroups = new Set<Element>();

  const add = (element: Element, type: FieldType, extra: Partial<FieldDescriptor> = {}) => {
    fields.push({
      id: idFor(element),
      label: findLabel(element),
      helperText: helperTextOf(element),
      section: sectionOf(element, headings),
      type,
      required: isRequired(element),
      currentValue: '',
      options: [],
      automationId: automationIdOf(element),
      ...extra,
    });
  };

  const controls = deepQueryAll(
    root,
    'input, textarea, select, button[aria-haspopup="listbox"], [role="combobox"]:not(input)',
  );

  for (const element of controls) {
    const input = element as HTMLInputElement;
    const kind = element.tagName === 'INPUT' ? (input.type || 'text').toLowerCase() : element.tagName.toLowerCase();

    if (kind === 'file') {
      // Workday hides the real file input behind a "Select files" button, so don't require visibility.
      add(element, 'file');
      continue;
    }
    // Site-wide search boxes and menus are not part of the application form.
    if (element.closest('header, nav, [role="banner"], [role="search"], [role="navigation"]')) continue;

    const isButtonLikeInput = element.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(kind);
    if (isButtonLikeInput || !isVisible(element)) continue;

    const automationId = automationIdOf(element);

    if (DATE_PART.test(automationId)) {
      // One field per date: use the box that holds the month/day/year parts.
      const group = element.closest('[data-automation-id^="formField"]') ?? element.parentElement?.parentElement ?? element;
      if (seenDateGroups.has(group)) continue;
      seenDateGroups.add(group);
      const parts = [...group.querySelectorAll<HTMLInputElement>('input')].map((part) => part.value).filter(Boolean);
      add(group, 'date', { label: findGroupLabel(element) || findLabel(element), required: isRequired(element), currentValue: parts.join('/') });
      continue;
    }

    if (kind === 'radio') {
      const name = input.name || findGroupLabel(input);
      if (seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
      const group = deepQueryAll<HTMLInputElement>(root, `input[type="radio"]`).filter((r) => (r.name || findGroupLabel(r)) === name);
      const checked = group.find((r) => r.checked);
      add(input, 'radio', {
        label: findGroupLabel(input),
        options: group.map((r) => findLabel(r)),
        currentValue: checked ? findLabel(checked) : '',
        required: group.some((r) => isRequired(r)),
      });
      continue;
    }

    if (kind === 'checkbox') {
      add(input, 'checkbox', { currentValue: input.checked ? 'true' : '' });
      continue;
    }

    if (kind === 'select') {
      const select = element as HTMLSelectElement;
      const selected = select.selectedOptions[0];
      add(select, 'select', {
        options: [...select.options].map((o) => cleanText(o.textContent)).filter((text) => text && !EMPTY_SELECT_TEXT.test(text)),
        currentValue: selected && select.value ? cleanText(selected.textContent) : '',
      });
      continue;
    }

    if (element.tagName === 'BUTTON') {
      // Workday drop-down: a button that opens a list. Its text is the chosen value.
      const text = cleanText(element.textContent);
      add(element, 'select', { currentValue: EMPTY_SELECT_TEXT.test(text) ? '' : text });
      continue;
    }

    if (kind === 'textarea') {
      add(element, 'textarea', { currentValue: (element as HTMLTextAreaElement).value });
      continue;
    }

    const isPrompt =
      element.getAttribute('role') === 'combobox' ||
      element.hasAttribute('aria-autocomplete') ||
      /multiselect|searchBox|selectinput/i.test(automationId + (element.getAttribute('data-uxi-widget-type') ?? ''));
    if (isPrompt) {
      // Already-picked items show as chips next to the search box.
      const container = element.closest('[data-automation-id^="formField"]') ?? element.parentElement;
      const chips = [...(container?.querySelectorAll('[data-automation-id="selectedItem"], [role="listitem"]') ?? [])]
        .map((chip) => cleanText(chip.textContent))
        .filter(Boolean);
      add(element, 'prompt', { currentValue: chips.join(', ') || input.value });
      continue;
    }

    add(element, 'text', { currentValue: input.value });
  }

  return fields;
}
