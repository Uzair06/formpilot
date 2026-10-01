// Simulated user actions. Workday is a React-style app: setting `.value` directly is ignored,
// so we use the browser's own value setter and fire the events a real user would cause.

export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function realClick(element: Element): void {
  const html = element as HTMLElement;
  html.scrollIntoView?.({ block: 'center' });
  const init = { bubbles: true, cancelable: true, view: window };
  html.dispatchEvent(new PointerEvent('pointerdown', init));
  html.dispatchEvent(new MouseEvent('mousedown', init));
  html.dispatchEvent(new PointerEvent('pointerup', init));
  html.dispatchEvent(new MouseEvent('mouseup', init));
  html.click();
}

export function pressKey(element: Element, key: string): void {
  const init = { key, code: key, bubbles: true, cancelable: true, keyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0 };
  element.dispatchEvent(new KeyboardEvent('keydown', init));
  element.dispatchEvent(new KeyboardEvent('keyup', init));
}

export function focus(element: Element): void {
  (element as HTMLElement).focus?.();
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

export function blur(element: Element): void {
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  (element as HTMLElement).blur?.();
}
