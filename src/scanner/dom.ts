// DOM helpers that also look inside open shadow roots (some Workday widgets use them).

export function deepQueryAll<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  const found: T[] = [...root.querySelectorAll<T>(selector)];
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) found.push(...deepQueryAll<T>(element.shadowRoot, selector));
  }
  return found;
}

export function cleanText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** True if the element is shown on the page (hidden file inputs are handled separately). */
export function isVisible(element: Element): boolean {
  const html = element as HTMLElement;
  if (html.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = getComputedStyle(html);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Real Chrome can also tell if a parent hides it; the test DOM has no layout, so skip it there.
  if (typeof html.checkVisibility === 'function' && navigator.userAgent.includes('Chrome')) {
    return html.checkVisibility({ visibilityProperty: true });
  }
  return true;
}
