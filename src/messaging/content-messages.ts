import { z } from 'zod';
import type { PageReport } from '@/src/orchestrator/run-state';
import type { FieldDescriptor } from '@/src/scanner/types';
import type { ErrorInfo, Result } from './messages';

// Messages the side panel sends to the content script running inside the Workday tab.

export const ContentRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scanPage') }),
  z.object({ type: z.literal('snapshotPage') }),
  z.object({ type: z.literal('fillPage') }), // fill the current page only
  z.object({ type: z.literal('runAll') }), // fill page after page until Review (answers at once; progress goes to storage)
  z.object({ type: z.literal('stopRun') }),
  z.object({ type: z.literal('submitApplication') }), // only sent when the user clicks "Confirm and submit"
]);

export type ContentRequest = z.infer<typeof ContentRequestSchema>;

export interface PageInfo {
  url: string;
  title: string; // the step heading, e.g. "My Information"
  step: number | null; // e.g. 2 in "current step 2 of 6"
  totalSteps: number | null;
}

export interface ContentResponses {
  scanPage: { page: PageInfo; fields: FieldDescriptor[] };
  snapshotPage: { page: PageInfo; html: string };
  fillPage: PageReport;
  runAll: { started: true };
  stopRun: { stopping: true };
  submitApplication: { started: true };
}

export type ContentResponseFor<R extends ContentRequest> = Result<ContentResponses[R['type']]>;

const NOT_ON_WORKDAY: ErrorInfo = {
  code: 'bad_request',
  message: 'Open a Workday job application page in this window first. If it is already open, refresh it once.',
};

/** Sends a request to the content script in the active tab. */
export async function sendToActiveTab<R extends ContentRequest>(request: R): Promise<ContentResponseFor<R>> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return { ok: false, error: NOT_ON_WORKDAY };
  try {
    const reply = (await browser.tabs.sendMessage(tab.id, request)) as ContentResponseFor<R> | undefined;
    return reply ?? { ok: false, error: NOT_ON_WORKDAY };
  } catch {
    // "Receiving end does not exist": not a Workday page, or the page was open before the extension loaded.
    return { ok: false, error: NOT_ON_WORKDAY };
  }
}
