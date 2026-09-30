# Decisions

One line per non-obvious decision.

- 2026-09-30 — AI provider is **Google Gemini** (developer's choice), behind a provider adapter so OpenAI/Anthropic can be added later.
- 2026-09-30 — Main UI is the Chrome side panel; the toolbar icon opens it (`sidePanel.setPanelBehavior`). The starter popup was removed.
- 2026-09-30 — Gemini API key lives in `chrome.storage.local` (not `sync`, so it never leaves this computer). The options page writes it; only the background worker reads it.
- 2026-09-30 — Answers profile yes/no questions default to `null` ("not answered"), not "no", so the Mapper pauses instead of silently answering for the user.
- 2026-09-30 — EEO values use our own option lists (default `decline`); the Mapper matches them to Workday's real options later (verify against recon in M7).
- 2026-09-30 — Saved profiles are re-checked with zod on load; invalid data is dropped and only the problem *paths* are logged (never values).
- 2026-09-30 — Original resume file + its extracted text are kept in the extension's IndexedDB (`formpilot` / `files` / `resume`). The content script runs as the Workday page and can't open this database, so M5 must send it the file by message.
- 2026-09-30 — PDF text is rebuilt in the PDF's own content order (not sorted by position), so two-column resumes stay column-by-column instead of mixing lines.
- 2026-09-30 — Link URLs are read separately (PDF link annotations; DOCX hyperlinks via mammoth's HTML) because resumes often show only "LinkedIn" as text.
- 2026-09-30 — Scanned/image-only resumes are refused with a clear message (no OCR). → LIMITATIONS.
- 2026-09-30 — Extension uses pdf.js's modern build (needs a recent Chrome); unit tests alias `pdfjs-dist` to its legacy build because Node lacks newer JS features.
- 2026-09-30 — Tooling: with npm 11.5.1, `npm install <pkg>` drops rolldown's native binding from `package-lock.json`, breaking builds. Workaround used: add the package's lock entry by hand, then `rm -rf node_modules && npm ci`.
- 2026-09-30 — Gemini is called with the stable `models/{model}:generateContent` endpoint + `responseJsonSchema` (JSON mode), not the newer Interactions API. Temperature left at default, per Google's advice for Gemini 3.
- 2026-09-30 — The JSON Schema sent to the AI is generated from the zod schema (`toAiJsonSchema`), so the shape is defined once. Unsupported keywords (`$schema`, `default`) are stripped.
- 2026-09-30 — After the AI, email/phone/links are checked against the resume text and hidden links; anything not found is cleared with a warning (stops made-up contact details).
- 2026-09-30 — AI call is retried once only when the answer is unusable (bad JSON / fails zod). Key, quota, and network errors are shown to the user right away.
- 2026-09-30 — Background messages are zod-checked and always answer `{ ok, data } | { ok, error }` (never throw across the message boundary).
- 2026-09-30 — `npm test` never calls a real API. `npm run test:live` (needs `GEMINI_API_KEY`) checks real Gemini against `tests/fixtures/resumes/alex-rivera.expected.ts`.
- 2026-09-30 — No hardcoded model: default is Google's `gemini-flash-latest` alias (moves to the newest Flash by itself; Google gives 2 weeks' notice of breaking changes). Settings lists the key's models live (`models.list`) so the user can pin one.
- 2026-09-30 — Gemini 500/503/504 are retried twice with backoff (1 s, then 3 s), as Google's error docs advise. This is an API backoff, not a page-loading wait, so it doesn't conflict with Hard Rule 7.
- 2026-09-30 — Errors carry Google's own short explanation (`detail`, e.g. "HTTP 503 — UNAVAILABLE: …"), shown in small print for troubleshooting. It never contains resume data.
- 2026-09-30 — Nullable fields are sent as `type: [X, "null"]` (Gemini's documented form) instead of zod's `anyOf`.
