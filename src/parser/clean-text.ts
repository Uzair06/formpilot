// Tidies text pulled out of a PDF/DOCX so the AI gets clean, compact input.
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[  -​  　]/g, ' ') // odd space characters → normal space
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f�]/g, '') // invisible junk
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // at most one blank line in a row
    .trim();
}

/** Keeps http(s) links only, without duplicates, in first-seen order. */
export function uniqueWebLinks(urls: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const url of urls) {
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) seen.add(trimmed);
  }
  return [...seen];
}
