import { cleanText } from './dom';
import type { PageInfo } from '@/src/messaging/content-messages';

/** The current step's heading, e.g. "My Information". */
export function pageInfo(doc: Document = document): PageInfo {
  const heading =
    doc.querySelector('[data-automation-id*="progressBarActiveStep" i]') ??
    doc.querySelector('main h2, [role="main"] h2') ??
    doc.querySelector('h2, h1');
  // Workday's progress bar reads like "current step 2 of 6My Information".
  const raw = cleanText(heading?.textContent);
  const match = raw.match(/step\s+(\d+)\s+of\s+(\d+)\s*(.*)$/i);
  return {
    url: doc.location.href,
    title: (match ? cleanText(match[3]) : raw) || doc.title,
    step: match ? Number(match[1]) : null,
    totalSteps: match ? Number(match[2]) : null,
  };
}

/**
 * A copy of the page's HTML for recon/debugging: scripts and styles removed (smaller, and
 * nothing runs when opened) and typed values cleared so no personal data ends up in the file.
 */
export function snapshotHtml(doc: Document = document): string {
  const copy = doc.documentElement.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('script, style, noscript, link[rel="stylesheet"], iframe').forEach((el) => el.remove());
  copy.querySelectorAll('input, textarea').forEach((el) => {
    el.removeAttribute('value');
    if (el.tagName === 'TEXTAREA') el.textContent = '';
  });
  return `<!doctype html>\n<!-- FormPilot snapshot of ${doc.location.href} at ${new Date().toISOString()} -->\n${copy.outerHTML}`;
}
