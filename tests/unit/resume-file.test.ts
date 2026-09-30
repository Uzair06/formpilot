import 'fake-indexeddb/auto'; // a pretend IndexedDB, since the test browser has none
import { beforeEach, describe, expect, it } from 'vitest';
import { clearResumeFile, loadResumeFile, saveResumeFile, type ResumeFile } from '@/src/profile/resume-file';

function sampleFile(): ResumeFile {
  return {
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    bytes: new Uint8Array([37, 80, 68, 70]).buffer, // "%PDF"
    text: 'Alex Rivera\nEngineer',
    links: ['https://github.com/alex-rivera-example'],
    savedAt: 1_700_000_000_000,
  };
}

describe('resume file store', () => {
  beforeEach(async () => {
    await clearResumeFile();
  });

  it('has nothing saved at first', async () => {
    expect(await loadResumeFile()).toBeNull();
  });

  it('saves and loads the file, bytes included', async () => {
    await saveResumeFile(sampleFile());
    const loaded = await loadResumeFile();
    expect(loaded?.name).toBe('resume.pdf');
    expect(loaded?.text).toBe('Alex Rivera\nEngineer');
    expect([...new Uint8Array(loaded!.bytes)]).toEqual([37, 80, 68, 70]);
  });

  it('replaces the old file when a new one is saved', async () => {
    await saveResumeFile(sampleFile());
    await saveResumeFile({ ...sampleFile(), name: 'new.docx' });
    expect((await loadResumeFile())?.name).toBe('new.docx');
  });

  it('clears the saved file', async () => {
    await saveResumeFile(sampleFile());
    await clearResumeFile();
    expect(await loadResumeFile()).toBeNull();
  });
});
