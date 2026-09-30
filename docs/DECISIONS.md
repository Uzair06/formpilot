# Decisions

One line per non-obvious decision.

- 2026-09-30 — AI provider is **Google Gemini** (developer's choice), behind a provider adapter so OpenAI/Anthropic can be added later.
- 2026-09-30 — Main UI is the Chrome side panel; the toolbar icon opens it (`sidePanel.setPanelBehavior`). The starter popup was removed.
- 2026-09-30 — Gemini API key lives in `chrome.storage.local` (not `sync`, so it never leaves this computer). The options page writes it; only the background worker reads it.
