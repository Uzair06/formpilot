import { getDocument } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { uniqueWebLinks } from './clean-text';

// pdf.js needs its worker file configured once before use; the side panel does that
// in entrypoints/sidepanel/main.tsx. Tests run the legacy build, which needs no setup.

export interface PdfText {
  text: string;
  links: string[];
}

export async function extractPdfText(bytes: ArrayBuffer): Promise<PdfText> {
  // pdf.js moves (transfers) the buffer it is given into its worker, which empties it
  // for us. Pass a copy so the caller can still save the original bytes afterwards.
  const loadingTask = getDocument({ data: new Uint8Array(bytes.slice(0)) });
  try {
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    const links: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items.filter((item): item is TextItem => 'str' in item)));
      // Resumes often show "LinkedIn" as text while the real URL is only in a link annotation.
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype === 'Link' && typeof annotation.url === 'string') links.push(annotation.url);
      }
    }
    return { text: pages.join('\n\n'), links: uniqueWebLinks(links) };
  } finally {
    await loadingTask.destroy(); // frees the worker and memory
  }
}

// Rebuilds lines from pdf.js text pieces, keeping the PDF's own reading order
// (which keeps two-column resumes column-by-column instead of mixing them).
export function joinTextItems(items: TextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  let lastEndX: number | null = null;

  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    if (item.str) {
      const movedDown = lastY !== null && Math.abs(y - lastY) > Math.max(item.height, 1) * 0.5;
      if (movedDown && !out.endsWith('\n')) {
        out += '\n';
      } else if (lastEndX !== null && x - lastEndX > 1 && !/\s$/.test(out) && !/^\s/.test(item.str)) {
        out += ' '; // visible gap between pieces on the same line
      }
      out += item.str;
      lastY = y;
      lastEndX = x + item.width;
    }
    if (item.hasEOL) {
      out += '\n';
      lastEndX = null;
    }
  }
  return out;
}
