import { storage } from 'wxt/utils/storage';
import type { PageInfo } from '@/src/messaging/content-messages';
import type { FieldDecision } from '@/src/mapper/types';
import type { PageKind } from '@/src/navigator/page';

// The autofill run's progress, kept in chrome.storage.local so the side panel can show it live
// (and it survives the side panel being closed and reopened).

export interface FieldReport extends FieldDecision {
  outcome?: 'filled' | 'failed';
  outcomeNote?: string;
  shownValue?: string; // what the page shows after filling
}

export interface PageReport {
  page: PageInfo;
  kind: PageKind;
  fields: FieldReport[];
}

export type RunStatus = 'idle' | 'running' | 'awaiting_auth' | 'needs_user' | 'review' | 'submitting' | 'done' | 'stopped' | 'error';

export interface RunState {
  status: RunStatus;
  message: string;
  pages: PageReport[]; // latest report per page title
  stopRequested: boolean;
  updatedAt: number;
}

export const IDLE_RUN: RunState = { status: 'idle', message: '', pages: [], stopRequested: false, updatedAt: 0 };

export const runState = storage.defineItem<RunState>('local:runState', { fallback: IDLE_RUN });

export async function updateRun(change: Partial<RunState>): Promise<RunState> {
  const next = { ...(await runState.getValue()), ...change, updatedAt: Date.now() };
  await runState.setValue(next);
  return next;
}

export async function recordPage(report: PageReport): Promise<void> {
  const current = await runState.getValue();
  const pages = current.pages.filter((p) => p.page.title !== report.page.title);
  await updateRun({ pages: [...pages, report] });
}
