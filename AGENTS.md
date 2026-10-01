# FormPilot — Project Context for Codex

This file gives Codex the full context of this project. Codex reads it automatically at the start of every session. Keep it updated as the project moves forward (especially the "Current status" section at the bottom).

---

## How to talk to me (the developer)

- **Explain everything in very simple language.** Short sentences. No jargon. If a technical word is needed, explain it in plain words the first time.
- Use simple analogies ("the robot", "the boxes on the form") when helpful.
- I know JavaScript, Node, React, Next.js, Express and PostgreSQL. Chrome extensions, WXT and AI APIs are new to me — explain those parts more carefully.
- Work in **small steps**. One feature at a time. Tell me what you are about to do, do it, then tell me how to test it.
- Before writing a big chunk of code, give me a short plan first and wait for my OK.
- After each step, tell me exactly what to run and what I should see if it worked.

---

## What the assignment is (simple version)

The full detailed plan is at /PLAN.md.

Build a **Chrome extension** called **FormPilot** that fills out job application forms on **Workday** (the website tool many big companies use for hiring) automatically.

The flow:
1. The user uploads their resume (PDF or Word).
2. FormPilot reads it and uses AI to turn it into a neat, structured list (name, email, phone, jobs, school, skills, links).
3. The user opens a Workday job page and logs in **themselves**.
4. FormPilot fills every page of the form: text boxes, drop-downs, dates, yes/no buttons, checkboxes, file upload, and repeatable sections (multiple jobs, multiple schools).
5. It clicks "Next" through every page.
6. At the end it shows a **review screen** and asks the user to confirm.
7. It submits **only after the user clicks confirm**.

### Selected target form
**NVIDIA** (tenant: `nvidia.wd5.myworkdayjobs.com`, site `NVIDIAExternalCareerSite`).
Assignment links:
- https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Senior-HPC-Storage-Engineer_JR2014997
- https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Senior-Deep-Learning-Framework-Communications-Engineer_JR2011908

If these postings are closed, any live NVIDIA posting uses the same application flow. Record the exact URL used in the README.

### Grading (what matters most)
| Criteria | Weight |
|---|---|
| Automation works end-to-end | 60% |
| AI field mapping accuracy | 25% |
| Resume parsing quality | 5% |
| Code quality & architecture | 5% |
| User experience | 5% |

→ **Getting the full form filled reliably is the #1 priority.** AI and UI polish come after.

### Deliverables
- Source code on GitHub
- Chrome extension build (zip)
- Docs: SETUP, ARCHITECTURE, AI STRATEGY, LIMITATIONS
- Demo video: upload → autofill → review → submit. Say "NVIDIA form" at the start.

---

## HARD RULES (never break these)

1. **Never submit without explicit user confirmation.** The submit action must only run after the user clicks a confirm button in FormPilot.
2. **Never bypass login/authentication.** Detect login / create-account / email-verification pages and **pause** so the user does it themselves.
3. **Never guess private/protected info** (gender, race/ethnicity, veteran status, disability). Only use what the user entered in their Answers profile. Default = "decline to self-identify".
4. **Never auto-check legal/terms consent checkboxes.** Flag them for the user.
5. **AI returns data only** (values, chosen options, confidence). It never returns code or CSS selectors to run. (Manifest V3 also forbids running remote code.)
6. **AI answers for drop-downs must be exactly one of the real options** on the page. Reject anything else.
7. **No fixed `sleep`/`setTimeout` waits** for page loading. Wait for real changes using MutationObserver-based helpers.
8. **Don't rely only on hardcoded selectors.** Find fields by their label/meaning first; Workday's `data-automation-id` attributes are a helpful hint, not the only way.
9. **Keep user data private.** Everything stays on the user's computer (chrome.storage / IndexedDB). No personal data in `console.log`. The API key is only used in the background service worker — never in the content script, never committed to GitHub.
10. **Don't overwrite fields that already have a valid value** (e.g. Workday's own autofill), unless the user allows it.

---

## Tech stack

- **TypeScript**
- **WXT** — framework for building Chrome extensions (Manifest V3, uses Vite)
- **React** — for the side panel UI
- **Chrome Side Panel** — main UI (stays open while pages change)
- **Google Gemini API** — behind a small adapter so the provider can be swapped; use structured JSON output
- **pdfjs-dist** — read PDF resumes
- **mammoth** — read DOCX resumes
- **zod** — validate AI output and messages
- **fuse.js** — fuzzy matching (e.g. matching a value to a drop-down option)
- **chrome.storage** + **IndexedDB** — local storage (no database, no backend)
- **Vitest + happy-dom** — unit and fixture tests
- **Playwright** — end-to-end tests with the extension loaded

**Not used:** Express, PostgreSQL, Next.js. There is no backend server.

---

## Architecture (simple version)

Three parts of the extension talk to each other:

1. **Side panel (React)** — what the user sees: upload resume, edit profile, fill the Answers profile, Start/Pause button, live log of what's being filled, low-confidence suggestions, and the final review + confirm screen. Resume reading (pdf.js / mammoth) happens here.
2. **Background service worker** — a simple messenger. Passes messages between parts and is the **only** place that calls the AI API (it holds the API key). Keeps no memory of its own (Chrome can shut it down anytime), so all state is saved to storage.
3. **Content script (runs inside the Workday page)** — does all the work on the form. Contains:
   - **Orchestrator** — the boss / state machine. Decides what happens next.
   - **Navigator** — knows which page/step we're on, clicks Next, spots errors, spots login pages.
   - **Scanner** — finds all fields on the current page: label, type, required?, current value, options.
   - **Mapper** — decides what value goes in each field. First simple rules (a dictionary of label synonyms), then one AI call per page for anything left over. Then a safety/policy check.
   - **Filler** — actually types/clicks into each field type and checks the value stuck.
   - **Validator** — checks for missing required fields and Workday error messages before moving on.

Run state is saved in `chrome.storage.session` so a page reload doesn't lose progress. The side panel listens to storage changes to show live updates.

### Orchestrator states
`IDLE → DETECT_PAGE → (AWAITING_AUTH) → SCAN_STEP → MAP → FILL → VERIFY → (AWAITING_USER) → ADVANCE → [repeat per page] → REVIEW → AWAITING_CONFIRMATION → SUBMITTING → DONE`
Any state can go to `ERROR_RECOVERY` or `PAUSED`.

### Mapping flow per page
1. Scan fields on the page.
2. Pass 1 — simple rules: match label to a known key (e.g. "Given Name" / "Legal First Name" → firstName).
3. Pass 2 — one batched AI call for the fields rules couldn't handle. AI gets: resume JSON + Answers profile + field labels + options. AI returns value + confidence for each.
4. Policy check (EEO rules, legal checkboxes, option must exist, confidence threshold).
5. High confidence → fill. Medium → show as suggestion. Low → skip and flag.
6. Cache decisions so repeat runs are fast and consistent.

---

## Folder structure

```
formpilot/
├─ entrypoints/
│  ├─ background.ts          (messenger + AI gateway)
│  ├─ workday.content/       (content script, runs on *.myworkdayjobs.com)
│  ├─ sidepanel/             (React UI)
│  └─ options/               (API key + settings)
├─ src/
│  ├─ parser/        (read resume text, AI → structured JSON)
│  ├─ profile/       (data shapes for resume + Answers profile, storage)
│  ├─ scanner/       (find fields, labels, field types)
│  ├─ mapper/        (rules, synonyms, fuzzy match, AI batch, policy, cache)
│  ├─ filler/        (one handler per field type + read-back check)
│  ├─ navigator/     (step detection, Next, errors, login detection)
│  ├─ orchestrator/  (state machine, saving state, submit gate)
│  ├─ validator/
│  ├─ ai/            (AI provider adapter, prompts, output schemas)
│  ├─ messaging/     (typed messages between parts)
│  └─ shared/        (waitFor helper, DOM helpers, safe logger, types)
├─ tests/            (unit/, fixtures/nvidia/, fixtures/resumes/, golden/, e2e/)
├─ docs/             (SETUP, ARCHITECTURE, AI_STRATEGY, LIMITATIONS, TESTING, DECISIONS, recon/)
└─ wxt.config.ts
```

---

## Data shapes (outline)

**Resume profile:** personal (first/middle/last/preferred name, email, phone {countryCode, number, type}, address {line1, city, state, postalCode, country}), links (linkedin, github, portfolio, other), workExperience[] (title, company, location, start {month, year}, end or null, current, description), education[] (school, degree, fieldOfStudy, startYear, endYear, gpa), skills[], certifications[] (name, issuer, date), languages[], summary, meta (warnings, confidence).

**Answers profile (entered by the user, never guessed):** work authorization, needs sponsorship, willing to relocate, 18+, previously worked at company, how did you hear about us, notice period, desired salary (optional), EEO (gender, ethnicity, veteran, disability — default "decline").

**Field descriptor (from Scanner):** id, label, helper text, section + repeat index, type (text / textarea / select / prompt-multiselect / radio / checkbox / date / file), required, current value, options, locator info.

**Field decision (from Mapper):** fieldId, value, source (rule / cache / ai / user / prefilled), confidence 0–1, short reason, status (filled / verified / suggested / skipped / failed).

---

## Workday things to watch out for (verify during recon)

- Drop-down menus open in a separate list attached to the end of the page (not inside the field).
- "Prompt" fields are search-as-you-type, sometimes with categories → sub-options (e.g. "How did you hear about us").
- Skills are a multi-select: type, pick the match, confirm a chip appears.
- Date fields are split into month/year parts; often need simulated key presses.
- React-style inputs need the native value setter + input/change/blur events.
- New fields can appear after answering a question — re-scan after filling radios/drop-downs.
- Entry options: "Autofill with Resume", "Apply Manually", "Use My Last Application". Build for "Apply Manually" first, but handle pre-filled data.
- **Only one final submit per job per account** — test up to the Review page freely; save the real submit for the demo.

---

## Build plan (milestones, in order)

| # | Milestone | Done when |
|---|---|---|
| M0 | Recon + setup | Every NVIDIA page and field written down in `docs/recon/`, HTML snapshots saved, repo builds |
| M1 | Resume + profile | Upload PDF/DOCX → AI → clean JSON → user can edit; Answers profile form; saved locally |
| M2 | Scanner | Debug button in side panel lists every field on the page correctly |
| M3 | Filler | Every field type can be filled and verified on real Workday |
| M4 | Mapper | "My Information" page fills completely by itself |
| M5 | Repeatable sections + upload | Jobs, schools, skills, websites, resume file upload; no duplicates |
| M6 | Orchestrator + Navigator | Goes through all pages alone; pauses for login; recovers from errors; survives reload |
| M7 | Questions + disclosures | Application Questions, Voluntary Disclosures, Self-Identify pages |
| M8 | Review + submit | Review screen, confirm button, submit, success detected |
| M9 | Hardening | Many test runs, slow network, reloads, second NVIDIA posting |
| M10 | Ship | Docs, release zip, demo video |

Time focus: the **Filler** (tricky field types) and the **Orchestrator/Navigator** will take the most time.

If time gets short: protect the full end-to-end flow + review/confirm + EEO rules. Cut UI polish and extras first.

---

## Working rules for Codex in this repo

- Read `docs/recon/` before writing any Workday-related code. **Do not guess Workday's HTML** — ask me for a snapshot if needed.
- One milestone / one feature per session. Plan first, then code in small slices.
- Write or update tests for each piece.
- After changes: tell me what to run (`npm run dev`, `npm test`) and what I should see.
- Log non-obvious decisions in `docs/DECISIONS.md` (one line each).
- Don't add special hacks for one specific label without a comment explaining why.
- Don't use Chrome APIs in the wrong place (no DOM in the service worker; no API key in the content script).

---

## Current status

- [x] Assignment understood, plan made
- [x] Name chosen: **FormPilot**
- [x] Repo set up with WXT + React, extra packages installed, pushed to GitHub
- **Deadline crunch (2026-10-01): ~1 day left of a 3-day assessment.** Scope is any Workday site, tested/demoed on NVIDIA. Work in big phases, commit per phase, short explanations.
- [x] **Phase A** — Scanner + debug tools (Scan this page, Save page snapshot); recon notes in `docs/recon/README.md`
- [x] **Phase B** — Filler: text, native/Workday drop-downs, search boxes (nested), radio, checkbox, split dates, file upload
- [x] **Phase C** — Mapper: label rules → one Gemini call per page → policy (prefilled kept, EEO only from Answers, consent flagged, sensitive never answered, options must be real, confidence tiers)
- [x] **Phase D** — Orchestrator/Navigator: Fill this page / Fill all pages, Add entries for jobs/schools, pause at sign-in, stop at errors or Review, live progress in the side panel
- [x] **Phase E** — Review list + two-step "Confirm and submit"; auto-start (Apply → Apply Manually); resume run after full page loads; wait at sign-in then continue; "Use" for AI suggestions
- [x] Docs: README, SETUP, ARCHITECTURE, AI_STRATEGY, LIMITATIONS, DEMO; release zip `npm run zip` (v1.0.0)
- [ ] **Next (needs the user):** live run on NVIDIA after sign-in → fix what breaks on real pages; record demo video
- `npm run test:e2e` runs the full flow on a fake Workday page (`tests/e2e/fake-workday.html`) in Chromium
- [x] **M1 — resume upload and parsing**
  - [x] Step 1: side panel, options page (Gemini API key), Vitest setup
  - [x] Step 2: data shapes (zod) + storage helpers
  - [x] Step 3: read PDF/DOCX text, keep original file in IndexedDB
  - [x] Step 4: Gemini adapter in background → structured JSON (live check: `GEMINI_API_KEY=… npm run test:live`; model picked in Settings, default `gemini-flash-latest`)
  - [x] Step 5: profile + Answers editing screens
    - [x] 5a: resume edit form with autosave
    - [x] 5b: Answers form + Resume/Answers tabs

(Update this list as work progresses.)
