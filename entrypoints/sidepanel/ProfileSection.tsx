import type { ErrorInfo } from '@/src/messaging/messages';
import type { ResumeProfile } from '@/src/profile/resume';
import ResumeEditor from './resume/ResumeEditor';

export type ParseState = { kind: 'idle' } | { kind: 'working' } | ({ kind: 'error' } & ErrorInfo);

interface Props {
  profile: ResumeProfile | null;
  /** Changes whenever the AI produces a new profile, so the editor starts fresh from it. */
  profileVersion: number;
  parse: ParseState;
  onSaved: (profile: ResumeProfile) => void;
}

export default function ProfileSection({ profile, profileVersion, parse, onSaved }: Props) {
  return (
    <section>
      <h2>Profile</h2>
      {parse.kind === 'working' && <p>Gemini is reading your resume… (this can take up to a minute)</p>}
      {parse.kind === 'error' && (
        <div className="card">
          <p className="error">{parse.message}</p>
          {parse.detail && <p className="muted small">{parse.detail}</p>}
          {['no_api_key', 'invalid_api_key', 'model_not_found'].includes(parse.code) && (
            <button type="button" onClick={() => browser.runtime.openOptionsPage()}>
              Open Settings
            </button>
          )}
        </div>
      )}
      {!profile && parse.kind === 'idle' && <p className="muted">Upload a resume to build your profile.</p>}
      {profile && parse.kind !== 'working' && (
        <>
          <p className="muted">Check what was read and fix anything that's wrong. Changes save automatically.</p>
          <ResumeEditor key={profileVersion} initial={profile} onSaved={onSaved} />
        </>
      )}
    </section>
  );
}
