import { ContentRequestSchema, type ContentRequest } from '@/src/messaging/content-messages';
import type { Result } from '@/src/messaging/messages';
import { fillCurrentPage, resumeRunAfterLoad, runAllPages, submitApplication, useSuggestion } from '@/src/orchestrator/fill-page';
import { updateRun } from '@/src/orchestrator/run-state';
import { scanPage } from '@/src/scanner/scan';
import { pageInfo, snapshotHtml } from '@/src/scanner/snapshot';

// Runs inside Workday pages. Does the scanning and filling when the side panel asks.
export default defineContentScript({
  matches: ['*://*.myworkdayjobs.com/*', '*://*.myworkdaysite.com/*', '*://*.myworkday.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return false;
      const request = ContentRequestSchema.safeParse(message);
      if (!request.success) return false; // not for us (e.g. a background-only message)
      handle(request.data).then(sendResponse);
      return true; // answer comes later
    });

    // A run that was going on before this page loaded continues here.
    running = true;
    resumeRunAfterLoad()
      .catch((error) => updateRun({ status: 'error', message: error instanceof Error ? error.message : 'Autofill failed.' }))
      .finally(() => (running = false));
  },
});

let running = false; // one run at a time

async function handle(request: ContentRequest): Promise<Result<unknown>> {
  try {
    switch (request.type) {
      case 'scanPage':
        return { ok: true, data: { page: pageInfo(), fields: scanPage() } };
      case 'snapshotPage':
        return { ok: true, data: { page: pageInfo(), html: snapshotHtml() } };
      case 'fillPage':
        return { ok: true, data: await fillCurrentPage() };
      case 'runAll':
        if (!running) {
          running = true;
          runAllPages()
            .catch((error) => updateRun({ status: 'error', message: error instanceof Error ? error.message : 'Autofill failed.' }))
            .finally(() => (running = false));
        }
        return { ok: true, data: { started: true } };
      case 'stopRun':
        await updateRun({ stopRequested: true });
        return { ok: true, data: { stopping: true } };
      case 'useSuggestion':
        return { ok: true, data: await useSuggestion(request.fieldId, request.value) };
      case 'submitApplication':
        void submitApplication().catch((error) => updateRun({ status: 'error', message: error instanceof Error ? error.message : 'Submit failed.' }));
        return { ok: true, data: { started: true } };
    }
  } catch (error) {
    console.error('[FormPilot] content script failed', error instanceof Error ? error.name : error);
    return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : 'FormPilot could not work on this page.' } };
  }
}
