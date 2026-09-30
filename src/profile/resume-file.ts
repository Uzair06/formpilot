import { z } from 'zod';

// The original resume file, kept in IndexedDB (too big for chrome.storage) so it can be
// uploaded to Workday later (M5), plus the text we read from it so we can re-run the AI
// without asking for the file again.
//
// Note: this IndexedDB belongs to the extension. The content script runs as the Workday
// page and cannot open it, so in M5 the file must be sent to it by message.

const DB_NAME = 'formpilot';
const DB_VERSION = 1;
const STORE = 'files';
const RESUME_KEY = 'resume';

export const ResumeFileSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  bytes: z.instanceof(ArrayBuffer),
  text: z.string(),
  links: z.array(z.string()),
  savedAt: z.number(), // Date.now() when uploaded
});

export type ResumeFile = z.infer<typeof ResumeFileSchema>;

export async function saveResumeFile(file: ResumeFile): Promise<void> {
  await withStore('readwrite', (store) => store.put(ResumeFileSchema.parse(file), RESUME_KEY));
}

/** The saved resume file, or null if none is saved (or the saved one is invalid). */
export async function loadResumeFile(): Promise<ResumeFile | null> {
  const raw = await withStore('readonly', (store) => store.get(RESUME_KEY));
  const result = ResumeFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export async function clearResumeFile(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(RESUME_KEY));
}

// --- tiny IndexedDB helpers (IndexedDB uses callbacks; these turn them into promises) ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      // Resolve only when the whole transaction is committed, not just the request.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
