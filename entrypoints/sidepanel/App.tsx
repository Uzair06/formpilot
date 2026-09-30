import { useEffect, useState } from 'react';
import { sendToBackground } from '@/src/messaging/messages';
import type { ResumeProfile } from '@/src/profile/resume';
import type { ResumeFile } from '@/src/profile/resume-file';
import { clearResumeProfile, loadResumeProfile, saveResumeProfile } from '@/src/profile/storage';
import ProfileSection, { type ParseState } from './ProfileSection';
import ResumeUpload from './ResumeUpload';

export default function App() {
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const [parse, setParse] = useState<ParseState>({ kind: 'idle' });

  // Show the profile saved last time, if there is one.
  useEffect(() => {
    loadResumeProfile().then(setProfile);
  }, []);

  // Ask the background worker (the only part holding the API key) to run the AI.
  async function buildProfile(file: ResumeFile) {
    setParse({ kind: 'working' });
    const result = await sendToBackground({ type: 'parseResume', text: file.text, links: file.links });
    if (!result.ok) {
      setParse({ kind: 'error', ...result.error });
      return;
    }
    await saveResumeProfile(result.data);
    setProfile(result.data);
    setProfileVersion((v) => v + 1);
    setParse({ kind: 'idle' });
  }

  async function removeProfile() {
    await clearResumeProfile();
    setProfile(null);
    setParse({ kind: 'idle' });
  }

  return (
    <main>
      <header className="row">
        <h1>FormPilot</h1>
        <button type="button" className="secondary" onClick={() => browser.runtime.openOptionsPage()}>
          Settings
        </button>
      </header>
      <ResumeUpload
        onResumeReady={buildProfile}
        onRemoved={removeProfile}
        busy={parse.kind === 'working'}
        hasProfile={profile !== null}
      />
      <ProfileSection profile={profile} profileVersion={profileVersion} parse={parse} />
    </main>
  );
}
