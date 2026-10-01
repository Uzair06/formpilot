import { cleanText } from './dom';

// Finds the human label of a form control, trying the most reliable sources first.
// Label-first on purpose: Workday's automation ids differ between versions and tenants.

function textOfIds(root: Document | ShadowRoot, ids: string): string {
  return cleanText(
    ids
      .split(/\s+/)
      .map((id) => root.getElementById(id)?.textContent ?? '')
      .join(' '),
  );
}

/** Label text without the required-marker asterisk. */
export function stripRequiredMark(text: string): string {
  return cleanText(text.replace(/\*/g, ''));
}

/** The label as written on the page (may still contain the required-marker asterisk). */
function findRawLabel(element: Element): string {
  const root = element.getRootNode() as Document | ShadowRoot;

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = textOfIds(root, labelledBy);
    if (text) return text;
  }

  const id = element.getAttribute('id');
  if (id) {
    const label = root.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent?.trim()) return cleanText(label.textContent);
  }

  const wrappingLabel = element.closest('label');
  if (wrappingLabel?.textContent?.trim()) return cleanText(wrappingLabel.textContent);

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) return cleanText(ariaLabel);

  const legend = element.closest('fieldset')?.querySelector('legend');
  if (legend?.textContent?.trim()) return cleanText(legend.textContent);

  // Workday wraps each question in a container whose automation id starts with "formField".
  const container = element.closest('[data-automation-id^="formField"]');
  const containerLabel = container?.querySelector('label, legend, [id$="label"], [data-automation-id*="label" i]');
  if (containerLabel?.textContent?.trim()) return cleanText(containerLabel.textContent);

  return cleanText(element.getAttribute('placeholder') ?? element.getAttribute('name') ?? '');
}

export function findLabel(element: Element): string {
  return stripRequiredMark(findRawLabel(element));
}

/** The question text for a radio group: its fieldset legend or the Workday form-field label. */
export function findGroupLabel(input: Element): string {
  const fieldset = input.closest('fieldset, [role="radiogroup"], [role="group"]');
  const legend = fieldset?.querySelector('legend');
  if (legend?.textContent?.trim()) return stripRequiredMark(legend.textContent);
  const labelledBy = fieldset?.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = textOfIds(input.getRootNode() as Document, labelledBy);
    if (text) return stripRequiredMark(text);
  }
  if (fieldset?.getAttribute('aria-label')) return stripRequiredMark(fieldset.getAttribute('aria-label')!);
  const container = input.closest('[data-automation-id^="formField"]');
  const label = container?.querySelector('label:not(:has(input)), legend, [data-automation-id*="label" i]');
  return stripRequiredMark(label?.textContent ?? '');
}

export function isRequired(element: Element): boolean {
  return (
    element.getAttribute('aria-required') === 'true' ||
    element.hasAttribute('required') ||
    findRawLabel(element).includes('*') ||
    Boolean(element.closest('[data-automation-id^="formField"]')?.querySelector('abbr[title*="required" i], [aria-label*="required" i]'))
  );
}
