import ResumeUpload from './ResumeUpload';

export default function App() {
  return (
    <main>
      <header className="row">
        <h1>FormPilot</h1>
        <button type="button" className="secondary" onClick={() => browser.runtime.openOptionsPage()}>
          Settings
        </button>
      </header>
      <ResumeUpload />
    </main>
  );
}
