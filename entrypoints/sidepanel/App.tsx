export default function App() {
  return (
    <main>
      <h1>FormPilot</h1>
      <p className="muted">Resume upload and profile editing arrive in the next steps.</p>
      <button onClick={() => browser.runtime.openOptionsPage()}>Settings</button>
    </main>
  );
}
