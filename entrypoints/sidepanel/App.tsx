import { useEffect, useState, type ReactNode } from 'react';
import { sendToBackground } from '@/src/messaging/messages';
import { countUnanswered, type AnswersProfile } from '@/src/profile/answers';
import type { ResumeProfile } from '@/src/profile/resume';
import type { ResumeFile } from '@/src/profile/resume-file';
import { clearResumeProfile, loadAnswersProfile, loadResumeProfile, saveResumeProfile } from '@/src/profile/storage';
import AnswersEditor from './answers/AnswersEditor';
import ProfileSection, { type ParseState } from './ProfileSection';
import ResumeUpload from './ResumeUpload';

type Tab = 'resume' | 'answers';

export default function App() {
  const [tab, setTab] = useState<Tab>('resume');
  // `profile` / `answers` always hold the latest saved version (the editors report every save),
  // so an editor that gets rebuilt starts from the user's edits, not an old copy.
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const [answers, setAnswers] = useState<AnswersProfile | null>(null);
  const [parse, setParse] = useState<ParseState>({ kind: 'idle' });

  // Show what was saved last time.
  useEffect(() => {
    loadResumeProfile().then(setProfile);
    loadAnswersProfile().then(setAnswers);
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

  const unanswered = answers ? countUnanswered(answers) : 0;

  return (
    <main>
      <header className="row">
        <h1>FormPilot</h1>
        <button type="button" className="secondary" onClick={() => browser.runtime.openOptionsPage()}>
          Settings
        </button>
      </header>

      <nav className="tabs" role="tablist">
        <TabButton id="resume" current={tab} onSelect={setTab}>
          Resume
        </TabButton>
        <TabButton id="answers" current={tab} onSelect={setTab}>
          Answers {unanswered > 0 && <span className="badge" aria-label={`${unanswered} not answered`}>{unanswered}</span>}
        </TabButton>
      </nav>

      {/* Both tabs stay mounted and are only hidden, so switching tabs never loses typing in progress. */}
      <div role="tabpanel" id="panel-resume" aria-labelledby="tab-resume" hidden={tab !== 'resume'}>
        <ResumeUpload
          onResumeReady={buildProfile}
          onRemoved={removeProfile}
          busy={parse.kind === 'working'}
          hasProfile={profile !== null}
        />
        <ProfileSection profile={profile} profileVersion={profileVersion} parse={parse} onSaved={setProfile} />
      </div>

      <div role="tabpanel" id="panel-answers" aria-labelledby="tab-answers" hidden={tab !== 'answers'}>
        <h2>Your answers</h2>
        <p className="muted">Questions only you can answer. They are never guessed from your resume.</p>
        {answers && <AnswersEditor initial={answers} onSaved={setAnswers} />}
      </div>
    </main>
  );
}

function TabButton({ id, current, onSelect, children }: { id: Tab; current: Tab; onSelect: (tab: Tab) => void; children: ReactNode }) {
  const selected = id === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      className={selected ? 'tab selected' : 'tab'}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  );
}
