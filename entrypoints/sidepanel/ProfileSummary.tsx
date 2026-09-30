import type { ErrorInfo } from '@/src/messaging/messages';
import type { ResumeProfile } from '@/src/profile/resume';

export type ParseState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | ({ kind: 'error' } & ErrorInfo);

interface Props {
  profile: ResumeProfile | null;
  parse: ParseState;
}

// A read-only look at what the AI found. Step 5 replaces this with an edit form.
export default function ProfileSummary({ profile, parse }: Props) {
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
      {profile && parse.kind !== 'working' && <Summary profile={profile} />}
    </section>
  );
}

function Summary({ profile }: { profile: ResumeProfile }) {
  const { personal, links, meta } = profile;
  const name = [personal.firstName, personal.middleName, personal.lastName].filter(Boolean).join(' ');
  const phone = [personal.phone.countryCode, personal.phone.number].filter(Boolean).join(' ');
  const place = [personal.address.city, personal.address.state, personal.address.country].filter(Boolean).join(', ');

  return (
    <div className="card">
      <p><strong>{name || '(no name found)'}</strong></p>
      <p>{personal.email || '(no email)'} · {phone || '(no phone)'}</p>
      {place && <p>{place}</p>}
      <p className="muted">
        {profile.workExperience.length} jobs · {profile.education.length} schools · {profile.skills.length} skills ·{' '}
        {[links.linkedin, links.github, links.portfolio, ...links.other].filter(Boolean).length} links
      </p>
      {meta.confidence !== null && <p className="muted">AI confidence: {Math.round(meta.confidence * 100)}%</p>}
      {meta.warnings.length > 0 && (
        <ul className="warnings">
          {meta.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>Show all data</summary>
        <pre className="text-preview">{JSON.stringify(profile, null, 2)}</pre>
      </details>
    </div>
  );
}
