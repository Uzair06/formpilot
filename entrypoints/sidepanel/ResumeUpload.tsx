import { useEffect, useState, type ChangeEvent } from 'react';
import { readResume, ResumeReadError } from '@/src/parser/read-resume';
import { clearResumeFile, loadResumeFile, saveResumeFile, type ResumeFile } from '@/src/profile/resume-file';

const MIME_BY_KIND = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'reading' } | { kind: 'error'; message: string };

interface Props {
  /** Called with a newly saved file, or when the user asks to read the saved one again. */
  onResumeReady: (file: ResumeFile) => void;
  onRemoved: () => void;
  busy: boolean; // true while the AI is working, so the user can't start a second run
  hasProfile: boolean; // if true, reading again replaces the user's edits, so ask first
}

export default function ResumeUpload({ onResumeReady, onRemoved, busy, hasProfile }: Props) {
  const [saved, setSaved] = useState<ResumeFile | null>(null);
  const [confirmingReread, setConfirmingReread] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  // Show the resume saved last time, if there is one.
  useEffect(() => {
    loadResumeFile()
      .then(setSaved)
      .finally(() => setStatus({ kind: 'ready' }));
  }, []);

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again still triggers a change
    if (!file) return;

    setStatus({ kind: 'reading' });
    try {
      const bytes = await file.arrayBuffer();
      const result = await readResume({ name: file.name, type: file.type, bytes });
      const record: ResumeFile = {
        name: file.name,
        mimeType: file.type || MIME_BY_KIND[result.kind],
        bytes,
        text: result.text,
        links: result.links,
        savedAt: Date.now(),
      };
      await saveResumeFile(record);
      setSaved(record);
      setStatus({ kind: 'ready' });
      onResumeReady(record);
    } catch (error) {
      const message = error instanceof ResumeReadError ? error.message : 'Something went wrong while saving. Please try again.';
      setStatus({ kind: 'error', message });
    }
  }

  async function onRemove() {
    await clearResumeFile();
    setSaved(null);
    onRemoved();
  }

  if (status.kind === 'loading') return <p className="muted">Loading…</p>;

  return (
    <section>
      <h2>Resume</h2>
      <label htmlFor="resume-file">{saved ? 'Replace resume' : 'Upload your resume'}</label>
      <input
        id="resume-file"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={status.kind === 'reading' || busy}
        onChange={onFileChosen}
      />
      <p className="muted">
        PDF or Word (.docx), up to 5 MB. Stays on this computer.
        {hasProfile && ' A new resume replaces your current profile.'}
      </p>

      {status.kind === 'reading' && <p>Reading your resume…</p>}
      {status.kind === 'error' && <p className="error">{status.message}</p>}

      {saved && (
        <div className="card">
          <p>
            <strong>{saved.name}</strong> · {(saved.bytes.byteLength / 1024).toFixed(0)} KB · {saved.text.length} characters read
          </p>
          {saved.links.length > 0 && (
            <p className="muted">Links found: {saved.links.join(', ')}</p>
          )}
          <details>
            <summary>Show text we read</summary>
            <pre className="text-preview">{saved.text}</pre>
          </details>
          {confirmingReread ? (
            <div className="confirm">
              <p>This replaces your profile, including any edits you made. Continue?</p>
              <div className="row">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingReread(false);
                    onResumeReady(saved);
                  }}
                >
                  Yes, read again
                </button>
                <button type="button" className="secondary" onClick={() => setConfirmingReread(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button type="button" disabled={busy} onClick={() => (hasProfile ? setConfirmingReread(true) : onResumeReady(saved))}>
                Read again with AI
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={onRemove}>
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
