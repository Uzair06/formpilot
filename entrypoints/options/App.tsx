import { useEffect, useState, type SubmitEvent } from 'react';
import { DEFAULT_GEMINI_MODEL, type GeminiModelInfo } from '@/src/ai/gemini';
import { sendToBackground, type ErrorInfo } from '@/src/messaging/messages';
import { geminiApiKey, geminiModel } from '@/src/shared/settings';

type ModelList =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; models: GeminiModelInfo[] }
  | { kind: 'error'; error: ErrorInfo };

export default function App() {
  const [key, setKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [modelList, setModelList] = useState<ModelList>({ kind: 'idle' });

  // Load saved settings once when the page opens; if a key is saved, fetch the model list.
  useEffect(() => {
    (async () => {
      const savedKey = await geminiApiKey.getValue();
      setKey(savedKey);
      setModel(await geminiModel.getValue());
      if (savedKey) await loadModels();
    })();
  }, []);

  // Asks the background worker (which holds the key) for the models this key can use.
  // A successful answer also proves the key works.
  async function loadModels() {
    setModelList({ kind: 'loading' });
    const result = await sendToBackground({ type: 'listModels' });
    setModelList(result.ok ? { kind: 'loaded', models: result.data } : { kind: 'error', error: result.error });
  }

  async function saveKey(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await geminiApiKey.setValue(key.trim());
      setKeyStatus('saved');
      if (key.trim()) await loadModels();
      else setModelList({ kind: 'idle' });
    } catch {
      setKeyStatus('error');
    }
  }

  async function chooseModel(id: string) {
    setModel(id);
    await geminiModel.setValue(id);
  }

  // The dropdown always offers the recommended alias and the current choice, even if the
  // live list is missing or doesn't include them (aliases are not always listed).
  const listed = modelList.kind === 'loaded' ? modelList.models : [];
  const extraIds = [DEFAULT_GEMINI_MODEL, model].filter((id, i, all) => all.indexOf(id) === i && !listed.some((m) => m.id === id));

  return (
    <main style={{ maxWidth: 520 }}>
      <h1>FormPilot Settings</h1>
      <p className="muted">
        Your key is saved only in this browser. It is used by the extension's background worker to call Gemini and is
        never sent anywhere else.
      </p>

      <form onSubmit={saveKey}>
        <label htmlFor="gemini-key">Gemini API key</label>
        <input
          id="gemini-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setKeyStatus('idle');
          }}
        />
        <button type="submit">Save</button>
      </form>
      {keyStatus === 'saved' && <p className="ok">Saved.</p>}
      {keyStatus === 'error' && <p className="error">Could not save. Please try again.</p>}

      <h2>Model</h2>
      <label htmlFor="gemini-model">Gemini model</label>
      <select id="gemini-model" value={model} onChange={(e) => chooseModel(e.target.value)}>
        {extraIds.map((id) => (
          <option key={id} value={id}>
            {id === DEFAULT_GEMINI_MODEL ? `${id} (recommended: always Google's newest Flash)` : id}
          </option>
        ))}
        {listed.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id === DEFAULT_GEMINI_MODEL ? `${m.id} (recommended)` : m.displayName ? `${m.id} — ${m.displayName}` : m.id}
          </option>
        ))}
      </select>
      {modelList.kind === 'idle' && <p className="muted">Save your key to see all models it can use.</p>}
      {modelList.kind === 'loading' && <p className="muted">Checking your key and loading models…</p>}
      {modelList.kind === 'loaded' && (
        <p className="ok">Key works. {modelList.models.length} text models available.</p>
      )}
      {modelList.kind === 'error' && (
        <>
          <p className="error">{modelList.error.message}</p>
          {modelList.error.detail && <p className="muted small">{modelList.error.detail}</p>}
        </>
      )}
    </main>
  );
}
