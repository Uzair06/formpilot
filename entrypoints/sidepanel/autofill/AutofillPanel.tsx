import { useEffect, useState } from 'react';
import { sendToActiveTab, type PageInfo } from '@/src/messaging/content-messages';
import type { ErrorInfo } from '@/src/messaging/messages';
import { IDLE_RUN, runState, type FieldReport, type RunState } from '@/src/orchestrator/run-state';
import type { FieldDescriptor } from '@/src/scanner/types';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'scanned'; page: PageInfo; fields: FieldDescriptor[] }
  | { kind: 'error'; error: ErrorInfo };

/** Saves text as a file in the user's Downloads folder. */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';

const STATUS_TEXT: Record<RunState['status'], string> = {
  idle: 'Ready',
  running: 'Filling…',
  awaiting_auth: 'Waiting for you to sign in',
  needs_user: 'Needs your help',
  review: 'Ready for review',
  submitting: 'Submitting…',
  done: 'Submitted',
  stopped: 'Stopped',
  error: 'Something went wrong',
};

export default function AutofillPanel() {
  const [run, setRun] = useState<RunState>(IDLE_RUN);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' });

  // Show the run's progress live (the content script writes it to storage).
  useEffect(() => {
    runState.getValue().then(setRun);
    return runState.watch((next) => setRun(next ?? IDLE_RUN));
  }, []);

  async function send(type: 'fillPage' | 'runAll' | 'stopRun' | 'submitApplication') {
    setNotice('');
    setBusy(type === 'fillPage');
    const result = await sendToActiveTab({ type });
    setBusy(false);
    if (!result.ok) setNotice(result.error.message);
  }

  async function startOver() {
    await runState.setValue(IDLE_RUN);
    setConfirming(false);
  }

  async function scanPage() {
    setScan({ kind: 'busy' });
    const result = await sendToActiveTab({ type: 'scanPage' });
    setScan(result.ok ? { kind: 'scanned', ...result.data } : { kind: 'error', error: result.error });
  }

  async function saveSnapshot() {
    const result = await sendToActiveTab({ type: 'snapshotPage' });
    if (!result.ok) return setNotice(result.error.message);
    const name = `workday-${slug(result.data.page.title)}.html`;
    download(name, result.data.html);
    setNotice(`Saved ${name} to your Downloads folder.`);
  }

  const running = run.status === 'running' || run.status === 'submitting' || busy;

  return (
    <section>
      <h2>Autofill</h2>
      <p className="muted">Open a Workday job application in this window. Sign-in is always left to you, and nothing is submitted until you confirm.</p>

      <div className="row wrap">
        <button type="button" onClick={() => send('runAll')} disabled={running}>
          Fill all pages
        </button>
        <button type="button" className="secondary" onClick={() => send('fillPage')} disabled={running}>
          {busy ? 'Filling…' : 'Fill this page'}
        </button>
        {running && (
          <button type="button" className="secondary" onClick={() => send('stopRun')}>
            Stop
          </button>
        )}
      </div>
      {notice && <p className="error">{notice}</p>}

      {run.status !== 'idle' && (
        <div className={`card run-status ${run.status}`}>
          <p>
            <strong>{STATUS_TEXT[run.status]}</strong>
          </p>
          {run.message && <p>{run.message}</p>}
        </div>
      )}

      {run.status === 'review' && (
        <div className="card confirm-card">
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)}>
              Confirm and submit…
            </button>
          ) : (
            <>
              <p>
                <strong>Submit this application now?</strong> You can only submit once per job. Make sure the Review page and the list below are right.
              </p>
              <div className="row">
                <button type="button" onClick={() => send('submitApplication').then(() => setConfirming(false))}>
                  Yes, submit
                </button>
                <button type="button" className="secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {run.pages.length > 0 && (
        <>
          <div className="row">
            <h3>What was filled</h3>
            <button type="button" className="link-button" onClick={startOver}>
              Clear
            </button>
          </div>
          {run.pages.map((report) => (
            <details key={report.page.title} open={report === run.pages.at(-1)}>
              <summary>
                {report.page.title} · {report.fields.filter((f) => f.outcome === 'filled').length} filled
                {countAttention(report.fields) > 0 && <span className="error"> · {countAttention(report.fields)} need you</span>}
              </summary>
              <ul className="report">
                {report.fields.map((f) => (
                  <li key={f.fieldId} className={`report-${rowKind(f)}`}>
                    <span className="report-label">{f.label || '(no label)'}</span>
                    <span className="report-value">{describe(f)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </>
      )}

      <details className="debug">
        <summary>Debug tools</summary>
        <div className="row">
          <button type="button" className="secondary" onClick={scanPage} disabled={scan.kind === 'busy'}>
            Scan this page
          </button>
          <button type="button" className="secondary" onClick={saveSnapshot}>
            Save page snapshot
          </button>
        </div>
        {scan.kind === 'error' && <p className="error">{scan.error.message}</p>}
        {scan.kind === 'scanned' && (
          <table className="fields-table">
            <thead>
              <tr>
                <th>Label ({scan.fields.length})</th>
                <th>Type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {scan.fields.map((field) => (
                <tr key={field.id} title={[field.section, field.automationId, field.options.join(' | ')].filter(Boolean).join('\n')}>
                  <td>
                    {field.label || <em className="muted">(no label)</em>}
                    {field.required && <span className="error"> *</span>}
                  </td>
                  <td>{field.type}</td>
                  <td>{field.currentValue ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}

const countAttention = (fields: FieldReport[]) => fields.filter((f) => rowKind(f) === 'attention').length;

function rowKind(f: FieldReport): 'filled' | 'attention' | 'suggest' | 'quiet' {
  if (f.outcome === 'filled') return 'filled';
  if (f.outcome === 'failed' || f.status === 'flag') return 'attention';
  if (f.status === 'suggest') return 'suggest';
  return 'quiet';
}

function describe(f: FieldReport): string {
  if (f.outcome === 'filled') return `✓ ${f.shownValue ?? f.value}${f.source === 'ai' ? ` (AI, ${Math.round(f.confidence * 100)}%)` : ''}`;
  if (f.outcome === 'failed') return `✗ ${f.outcomeNote ?? 'Could not fill'}`;
  if (f.status === 'suggest') return `Suggestion: ${Array.isArray(f.value) ? f.value.join(', ') : f.value} (${Math.round(f.confidence * 100)}%) — ${f.reason}`;
  return f.reason;
}
