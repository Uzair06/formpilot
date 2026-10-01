// Waits for the page to reach a state, by watching DOM changes (MutationObserver).
// No fixed sleeps (Hard Rule 7): the timeout is only a safety limit so we never hang forever.

export class WaitTimeoutError extends Error {
  constructor(what: string) {
    super(`Timed out waiting for ${what}`);
    this.name = 'WaitTimeoutError';
  }
}

export function waitFor<T>(
  check: () => T | null | undefined | false,
  { what = 'the page', timeoutMs = 8_000, root = document.documentElement }: { what?: string; timeoutMs?: number; root?: Node } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const first = check();
    if (first) return resolve(first);

    const observer = new MutationObserver(() => {
      const result = check();
      if (result) {
        cleanup();
        resolve(result);
      }
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new WaitTimeoutError(what));
    }, timeoutMs);
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

/** Resolves once the DOM has had no changes for `quietMs` (e.g. after Workday re-renders a section). */
export function waitForQuiet({ quietMs = 300, timeoutMs = 8_000, root = document.documentElement } = {}): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer = setTimeout(done, quietMs);
    const limit = setTimeout(done, timeoutMs);
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, quietMs);
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() {
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(limit);
      resolve();
    }
  });
}
