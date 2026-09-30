import { cleanText } from './clean-text';
import { extractDocxText } from './docx';
import { extractPdfText } from './pdf';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB is plenty for a text resume

// Less text than this means the file is probably a scanned image (no text layer).
const MIN_TEXT_CHARS = 50;

export type ResumeFileKind = 'pdf' | 'docx';

export interface ReadResume {
  kind: ResumeFileKind;
  text: string;
  links: string[];
}

export type ResumeReadErrorCode = 'unsupported_type' | 'too_large' | 'no_text' | 'unreadable';

const MESSAGES: Record<ResumeReadErrorCode, string> = {
  unsupported_type: 'Please upload a PDF or Word (.docx) file. Old .doc files need to be saved as .docx first.',
  too_large: 'This file is larger than 5 MB. Please upload a smaller resume.',
  no_text: 'No text was found in this file. It may be a scanned image — please upload a PDF or Word file with real text.',
  unreadable: 'This file could not be read. It may be damaged or password-protected.',
};

export class ResumeReadError extends Error {
  constructor(readonly code: ResumeReadErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ResumeReadError';
  }
}

/** Decides the file kind from its name first (MIME types are often missing), then its MIME type. */
export function detectResumeKind(name: string, mimeType: string): ResumeFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return null;
}

/** Reads the text (and hidden link URLs) from a resume file. Throws ResumeReadError. */
export async function readResume(file: { name: string; type: string; bytes: ArrayBuffer }): Promise<ReadResume> {
  const kind = detectResumeKind(file.name, file.type);
  if (!kind) throw new ResumeReadError('unsupported_type');
  if (file.bytes.byteLength > MAX_RESUME_BYTES) throw new ResumeReadError('too_large');

  let extracted;
  try {
    extracted = kind === 'pdf' ? await extractPdfText(file.bytes) : await extractDocxText(file.bytes);
  } catch (error) {
    // Library error messages describe the file format, not its contents, so they are safe to log.
    console.warn('[FormPilot] could not read resume file', error instanceof Error ? `${error.name}: ${error.message}` : error);
    throw new ResumeReadError('unreadable');
  }

  const text = cleanText(extracted.text);
  if (text.length < MIN_TEXT_CHARS) throw new ResumeReadError('no_text');
  return { kind, text, links: extracted.links };
}
