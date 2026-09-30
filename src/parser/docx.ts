import mammoth from 'mammoth';
import { uniqueWebLinks } from './clean-text';

export interface DocxText {
  text: string;
  links: string[];
}

export async function extractDocxText(bytes: ArrayBuffer): Promise<DocxText> {
  // mammoth's browser build reads `arrayBuffer`; its Node build (used by tests) reads `buffer`.
  // Both accept an ArrayBuffer, so pass it under both names.
  const input = { arrayBuffer: bytes, buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer };
  const [raw, html] = await Promise.all([mammoth.extractRawText(input), mammoth.convertToHtml(input)]);
  // Raw text drops hyperlink targets, so read them from the HTML version.
  const hrefs = [...html.value.matchAll(/href="([^"]+)"/g)].map((match) => (match[1] ?? '').replace(/&amp;/g, '&'));
  return { text: raw.value, links: uniqueWebLinks(hrefs) };
}
