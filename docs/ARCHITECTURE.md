# Architecture

FormPilot is a Manifest V3 extension built with WXT, React and TypeScript. It has **no backend**: all data stays in the browser, and the only outside service is the Gemini API.

```
┌──────────────── Side panel (React) ────────────────┐      ┌──── Background service worker ────┐
│ Resume tab: upload → pdf.js / mammoth → text        │ msg  │ Only place that holds the API key │
│             → edit profile (autosave)               │─────▶│ parseResume  → Gemini → profile   │
│ Answers tab: yes/no, EEO (default decline)          │      │ mapFields    → Gemini → values    │
│ Autofill tab: Fill all / Fill page / Stop / Review  │      │ listModels, getResumeFile         │
│               live progress  ◀── storage.watch ──┐  │      └───────────────▲───────────────────┘
└───────────────┬──────────────────────────────────│──┘                      │ msg
                │ tabs.sendMessage                  │ chrome.storage.local    │
                ▼                                   │ (runState)              │
┌──────────── Content script (inside the Workday tab) ────────────────────────┴───────┐
│ Orchestrator: job → Apply Manually → [sign-in pause] → fill → Next … → Review       │
│   Navigator: page kind, Next/Submit buttons, Workday errors, step from progress bar │
│   Scanner:   every control → {label, type, required, value, options, section}       │
│   Mapper:    label rules → one AI call per page → policy checks                     │
│   Filler:    one handler per field type, React-safe events, read-back check         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Folders

| Path | Role |
|---|---|
| `entrypoints/background.ts` | Message router; calls Gemini. Has no DOM and keeps no state of its own. |
| `entrypoints/workday.content/` | Content script for `*.myworkdayjobs.com`, `*.myworkdaysite.com` and `*.myworkday.com`. Answers side-panel requests and resumes a run after a page load. |
| `entrypoints/sidepanel/` | React UI: Autofill, Resume and Answers tabs |
| `entrypoints/options/` | Settings: API key and model picker (filled from the live model list) |
| `src/parser/` | PDF/DOCX text extraction, AI parse, check against the source text |
| `src/profile/` | zod schemas for the resume and answers, the edit "draft", storage (chrome.storage + IndexedDB) |
| `src/ai/` | Provider adapter (Gemini), JSON-Schema generation from zod, prompts |
| `src/scanner/` | Field discovery, labels, page info, snapshots |
| `src/mapper/` | Label rules, AI pass, policy, option checks |
| `src/filler/` | Simulated user events, per-type fill handlers |
| `src/navigator/` | Page kind, Next/Submit, error detection |
| `src/orchestrator/` | Fill one page, run all pages, resume after reload, submit gate, run state |
| `src/messaging/` | Typed, zod-checked messages (`{ ok, data } \| { ok, error }`) |
| `src/shared/` | MutationObserver `waitFor`/`waitForQuiet`, option matching, settings |

## Key flows

**Resume upload.**
1. The side panel reads the file with pdf.js or mammoth, including hidden link targets.
2. The original file is saved in IndexedDB.
3. The text goes to the background, which asks Gemini in JSON mode.
4. The answer is validated with zod, retried once if it's unusable, and checked against the source text.
5. It is saved to `chrome.storage.local`, and the user edits it there.

**Autofill run** (`runAllPages`). The loop runs per page:
- **Job posting:** click Apply, then Apply Manually.
- **Sign-in:** pause. FormPilot never touches credentials and continues when the page moves on.
- **Form page:**
  1. Add Work Experience / Education entries until they match the profile.
  2. Scan the page.
  3. Open empty drop-downs to read their real options.
  4. Map values.
  5. Fill them.
  6. Re-scan for questions that appear after an answer (up to 3 passes).
  7. Click Next and wait for the step to change, or for Workday errors.
- **Review:** stop and show the report.
- **Submit:** happens only after the side panel's two-step confirm sends `submitApplication`.

**Surviving page loads.** Some Workday steps, such as Apply Manually and signing in, do a full page load. Run progress lives in `chrome.storage.local`, and a newly started content script resumes a run that was active in the last 10 minutes.

**Waiting.** There are no fixed sleeps. Every wait is a `MutationObserver` check (`waitFor`) or "no DOM changes for N ms" (`waitForQuiet`), with a safety timeout.

## Privacy and security

- The API key lives in `chrome.storage.local` and is only read by the background worker. It is sent in a header, never in the URL.
- The resume, profile and answers stay in the browser.
- Text sent to Gemini:
  - the resume text, when parsing
  - field labels and options, plus the profile **without EEO answers**, when mapping
- Logs record error codes and field paths, never values.
- Page snapshots (a debug tool) strip scripts, styles and typed values.
- Host permissions: `generativelanguage.googleapis.com`, plus the Workday domains for the content script.
