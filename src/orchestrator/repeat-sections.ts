import { realClick } from '@/src/filler/events';
import { elementFor } from '@/src/filler/fill';
import { cleanText, deepQueryAll, isVisible } from '@/src/scanner/dom';
import { findLabel } from '@/src/scanner/label';
import type { FieldDescriptor } from '@/src/scanner/types';
import { waitFor, waitForQuiet } from '@/src/shared/wait';

// Repeatable sections (Work Experience, Education). Entries are found by their *fields*
// (one "Job Title" box = one job), not by heading text, because tenants word headings differently.

export interface RepeatKind {
  name: string; // used as the section label, e.g. "Work Experience 2"
  anchor: RegExp; // the label of one field every entry has exactly once
  sectionTitle: RegExp; // the section heading / Add button wording
}

export const WORK: RepeatKind = { name: 'Work Experience', anchor: /^job title$|^position title$|^title$/i, sectionTitle: /work experience|employment/i };
export const EDUCATION: RepeatKind = { name: 'Education', anchor: /school|university|institution/i, sectionTitle: /education/i };

/** The anchor field of each entry, in page order. */
function anchors(kind: RepeatKind): HTMLElement[] {
  return deepQueryAll<HTMLElement>(document, 'main input:not([type]), main input[type="text"], main button[aria-haspopup="listbox"], main [role="combobox"]')
    .filter((el) => isVisible(el) && kind.anchor.test(findLabel(el)));
}

/** The smallest box around one anchor that holds no other entry (and no Add button, which sits outside entries). */
function entryBox(anchor: HTMLElement, all: HTMLElement[]): HTMLElement {
  const group = anchor.closest<HTMLElement>('[role="group"]');
  if (group && !all.some((other) => other !== anchor && group.contains(other))) return group;
  let box = anchor;
  while (box.parentElement && box.parentElement !== document.body) {
    const parent = box.parentElement;
    const holdsAnotherEntry = all.some((other) => other !== anchor && parent.contains(other));
    const holdsAddButton = [...parent.querySelectorAll('button')].some((b) => /^add\b/i.test(cleanText(b.textContent || b.getAttribute('aria-label'))));
    const holdsOtherSection = parent.querySelector('input[type="file"]') !== null;
    if (holdsAnotherEntry || holdsAddButton || holdsOtherSection) break;
    box = parent;
  }
  return box;
}

/** Sets field.section to e.g. "Work Experience 2" for fields inside the 2nd job's box. */
export function labelRepeatSections(fields: FieldDescriptor[], kinds: RepeatKind[] = [WORK, EDUCATION]): void {
  for (const kind of kinds) {
    const all = anchors(kind);
    const boxes = all.map((anchor) => entryBox(anchor, all));
    for (const field of fields) {
      const element = elementFor(field);
      if (!element) continue;
      const index = boxes.findIndex((box) => box.contains(element));
      if (index >= 0) field.section = `${kind.name} ${index + 1}`;
    }
  }
}

function addButton(kind: RepeatKind): HTMLElement | null {
  const buttons = deepQueryAll<HTMLElement>(document, 'main button, main [role="button"]').filter(
    (b) => isVisible(b) && /^add\b/i.test(cleanText(b.textContent || b.getAttribute('aria-label'))),
  );
  // Prefer a button that names the section ("Add Work Experience"), else the Add right after the section heading.
  const named = buttons.find((b) => kind.sectionTitle.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`));
  if (named) return named;
  const heading = deepQueryAll(document, 'main h2, main h3, main h4, main [role="heading"]').find((h) => isVisible(h) && kind.sectionTitle.test(cleanText(h.textContent)));
  if (!heading) return null;
  return buttons.find((b) => heading.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null;
}

/** Clicks Add until the section has `wanted` entries. Stops at once if a click adds nothing. */
export async function ensureEntries(kind: RepeatKind, wanted: number): Promise<void> {
  for (let clicks = 0; clicks < wanted; clicks++) {
    const have = anchors(kind).length;
    if (have >= wanted) return;
    const button = addButton(kind);
    if (!button) return;
    realClick(button);
    const grew = await waitFor(() => anchors(kind).length > have, { what: `a new ${kind.name} entry`, timeoutMs: 6_000 }).catch(() => false);
    if (!grew) return; // never keep clicking blindly
    await waitForQuiet({ quietMs: 300, timeoutMs: 3_000 });
  }
}
