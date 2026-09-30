# Decisions

One line per non-obvious decision.

- 2026-09-30 — AI provider is **Google Gemini** (developer's choice), behind a provider adapter so OpenAI/Anthropic can be added later.
- 2026-09-30 — Main UI is the Chrome side panel; the toolbar icon opens it (`sidePanel.setPanelBehavior`). The starter popup was removed.
- 2026-09-30 — Gemini API key lives in `chrome.storage.local` (not `sync`, so it never leaves this computer). The options page writes it; only the background worker reads it.
- 2026-09-30 — Answers profile yes/no questions default to `null` ("not answered"), not "no", so the Mapper pauses instead of silently answering for the user.
- 2026-09-30 — EEO values use our own option lists (default `decline`); the Mapper matches them to Workday's real options later (verify against recon in M7).
- 2026-09-30 — Saved profiles are re-checked with zod on load; invalid data is dropped and only the problem *paths* are logged (never values).
