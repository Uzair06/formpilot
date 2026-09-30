import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'invalid' | 'error';

const DEFAULT_DELAY_MS = 600;

/**
 * Saves `value` a short moment after the user stops typing.
 * - `value` must keep the same identity until it really changes (wrap it in useMemo).
 * - `null` means "not valid right now": nothing is saved and the status is 'invalid'.
 * - The first value (what was loaded from storage) is not saved again.
 * - A waiting save is written at once if the panel is closed or hidden.
 */
export function useAutosave<T>(value: T | null, save: (value: T) => Promise<void>, delayMs = DEFAULT_DELAY_MS): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const initialValue = useRef(value); // compared by identity, so React's dev double-run doesn't re-save it
  const waiting = useRef<{ value: T; timer: ReturnType<typeof setTimeout> } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve()); // keeps saves in order
  const saveRef = useRef(save);
  saveRef.current = save;

  const write = (next: T) => {
    setStatus('saving');
    queue.current = queue.current
      .then(() => saveRef.current(next))
      .then(
        () => setStatus((current) => (current === 'saving' ? 'saved' : current)),
        () => setStatus('error'),
      );
  };

  const flush = () => {
    if (!waiting.current) return;
    clearTimeout(waiting.current.timer);
    const next = waiting.current.value;
    waiting.current = null;
    write(next);
  };

  useEffect(() => {
    if (value === initialValue.current) return;
    if (waiting.current) clearTimeout(waiting.current.timer);
    waiting.current = null;
    if (value === null) {
      setStatus('invalid');
      return;
    }
    setStatus('pending');
    waiting.current = { value, timer: setTimeout(flush, delayMs) };
  }, [value]);

  // Don't lose the last change when the panel closes or the component goes away.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  return status;
}

export function saveStatusText(status: SaveStatus): string {
  switch (status) {
    case 'saved':
      return 'All changes saved';
    case 'pending':
    case 'saving':
      return 'Saving…';
    case 'invalid':
      return 'Not saved — fix the boxes marked in red';
    case 'error':
      return 'Could not save. Please try again.';
  }
}
