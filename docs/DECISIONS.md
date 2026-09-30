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
