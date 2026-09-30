import { GlobalWorkerOptions } from 'pdfjs-dist';
// `?url` asks Vite to copy pdf.js's worker into the extension and give us its address.
// The worker must be a file inside the extension: Chrome extensions may not load code from the web.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Call once in any extension page that reads PDFs (the side panel). */
export function setUpPdfWorker(): void {
  GlobalWorkerOptions.workerSrc = workerUrl;
}
