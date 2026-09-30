import { useEffect, useState, type FormEvent } from 'react';
import { geminiApiKey } from '@/src/shared/settings';

export default function App() {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Load the saved key once when the page opens.
  useEffect(() => {
    geminiApiKey.getValue().then(setKey);
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await geminiApiKey.setValue(key.trim());
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <main style={{ maxWidth: 480 }}>
      <h1>FormPilot Settings</h1>
      <p className="muted">
        Your key is saved only in this browser. It is used by the extension's background worker to
        call Gemini and is never sent anywhere else.
      </p>
      <form onSubmit={save}>
        <label htmlFor="gemini-key">Gemini API key</label>
        <input
          id="gemini-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setStatus('idle');
          }}
        />
        <button type="submit">Save</button>
      </form>
      {status === 'saved' && <p className="ok">Saved.</p>}
      {status === 'error' && <p className="error">Could not save. Please try again.</p>}
    </main>
  );
}
