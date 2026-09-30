// @vitest-environment node
// (pdf.js and mammoth read files the Node way here; the browser-like test environment is not needed.)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectResumeKind, MAX_RESUME_BYTES, readResume, ResumeReadError } from '@/src/parser/read-resume';

function fixture(name: string, type = ''): { name: string; type: string; bytes: ArrayBuffer } {
  const buffer = readFileSync(resolve(__dirname, '../../fixtures/resumes', name));
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return { name, type, bytes };
}

async function readError(file: Parameters<typeof readResume>[0]): Promise<ResumeReadError> {
  const error = await readResume(file).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ResumeReadError);
  return error as ResumeReadError;
}

const EXPECTED_LINKS = [
  'https://www.linkedin.com/in/alex-rivera-example',
  'https://github.com/alex-rivera-example',
  expect.stringMatching(/^https:\/\/alexrivera\.example\.com\/?$/),
];

describe.each([
  ['alex-rivera.pdf', 'pdf'],
  ['alex-rivera.docx', 'docx'],
])('reading %s', (name, kind) => {
  it('gets the text in reading order, one line per line', async () => {
    const result = await readResume(fixture(name));
    const lines = result.text.split('\n');

    expect(result.kind).toBe(kind);
    expect(lines[0]).toBe('Alex J. Rivera');
    expect(result.text).toContain('alex.rivera@example.com');
    expect(result.text).toContain('+1 (555) 010-0142');
    expect(result.text).toContain('C++, Python, CUDA, NCCL, MPI, Lustre, Ceph, Kubernetes, Linux');
    // Sections come out in the same order as in the document.
    const order = ['Summary', 'Experience', 'Education', 'Skills'].map((heading) => lines.indexOf(heading));
    expect(order.every((index) => index > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('finds link URLs hidden behind words like "LinkedIn"', async () => {
    const result = await readResume(fixture(name));
    expect(result.links).toEqual(EXPECTED_LINKS);
  });
});

describe('readResume errors', () => {
  it('says so when a PDF has no text (e.g. a scanned image)', async () => {
    expect((await readError(fixture('blank.pdf'))).code).toBe('no_text');
  });

  it('refuses file types it cannot read', async () => {
    const error = await readError({ name: 'resume.doc', type: 'application/msword', bytes: new ArrayBuffer(10) });
    expect(error.code).toBe('unsupported_type');
    expect(error.message).toContain('.docx');
  });

  it('refuses files over the size limit', async () => {
    const error = await readError({ name: 'big.pdf', type: '', bytes: new ArrayBuffer(MAX_RESUME_BYTES + 1) });
    expect(error.code).toBe('too_large');
  });

  it('reports damaged files as unreadable', async () => {
    const junk = new TextEncoder().encode('this is not really a pdf').buffer as ArrayBuffer;
    expect((await readError({ name: 'broken.pdf', type: '', bytes: junk })).code).toBe('unreadable');
    expect((await readError({ name: 'broken.docx', type: '', bytes: junk })).code).toBe('unreadable');
  });

  it('leaves the original bytes untouched so they can still be saved', async () => {
    const file = fixture('alex-rivera.pdf');
    const size = file.bytes.byteLength;
    await readResume(file);
    expect(file.bytes.byteLength).toBe(size);
  });
});

describe('detectResumeKind', () => {
  it('uses the file name first, then the MIME type', () => {
    expect(detectResumeKind('CV.PDF', '')).toBe('pdf');
    expect(detectResumeKind('cv.docx', '')).toBe('docx');
    expect(detectResumeKind('download', 'application/pdf')).toBe('pdf');
    expect(detectResumeKind('notes.txt', 'text/plain')).toBeNull();
  });
});
