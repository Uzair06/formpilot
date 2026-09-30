import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Tiny helpers to draw React components in the test browser (happy-dom) and poke them,
// using only React's own tools.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Rendered {
  container: HTMLElement;
  root: Root;
  unmount: () => Promise<void>;
}

export async function render(element: ReactElement): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Finds the box whose <label> says exactly `text`. */
export function field<T extends HTMLElement = HTMLInputElement>(container: HTMLElement, text: string, index = 0): T {
  const labels = [...container.querySelectorAll('label')].filter((label) => label.textContent?.trim() === text);
  const label = labels[index];
  if (!label) throw new Error(`No field labelled "${text}" (#${index})`);
  const target = container.querySelector<T>(`#${CSS.escape(label.htmlFor)}`);
  if (!target) throw new Error(`Label "${text}" points at nothing`);
  return target;
}

/** Types into an input/textarea/select the way a browser does, so React's onChange fires. */
export async function typeInto(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = Object.getPrototypeOf(element) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

export async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

export function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
}

/** Lets pretend time pass (with vi.useFakeTimers) and settles React updates. */
export async function passTime(ms: number, advance: (ms: number) => Promise<unknown>) {
  await act(async () => {
    await advance(ms);
  });
}
