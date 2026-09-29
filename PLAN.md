# FormPilot: Full Technical Plan

This is the detailed plan for FormPilot. `CLAUDE.md` has the short version; this file has all the details (tricky situations, testing, demo video, time estimates).

---

## Simple summary (read this first)

- **What we're building:** a Chrome extension that fills Workday job application forms for you, using your resume and AI.
- **Which form:** NVIDIA's Workday application.
- **Most important thing:** the robot must fill the *whole* form correctly, page by page. That's 60% of the grade.
- **Hardest part:** the tricky boxes (drop-downs, dates, search boxes, skill lists) and moving between pages reliably.
- **Golden rules:** never submit without the user saying yes, never skip the login, never guess private info like gender or race.

---

## 1. What the assignment is really asking

On the surface it's an "AI Chrome extension." Look at the grading, though: 60% is end-to-end automation correctness and 25% is mapping accuracy. Only 5% is parsing, 5% code quality, and 5% UX. So this is mainly a **DOM-automation reliability problem**, with AI as the decision layer on top. The LLM part is the easy part. The hard part is getting Workday's custom dropdowns, typeahead "prompt" fields, split date inputs, repeatable sections, and step transitions to behave, every time.

The evaluator wants to see four things:

1. It completes the whole flow for one tenant.
2. It isn't built on brittle hardcoded selectors.
3. It knows when *not* to guess, especially on EEO and legal questions.
4. It never submits without your explicit confirmation.

Interpreting some phrases:

- **"Login screens, profile creation"** means Workday's per-tenant candidate account (sign in / create account / email verification). The extension should *detect* these screens and *pause* for the user. It may prefill the email, but it must not automate around authentication.
- **"Handle shadow DOM"** means DOM traversal should descend into open shadow roots generically. Workday's candidate UI is mostly light DOM, but its dropdown menus render in **portals** at the end of `<body>`, not inside the field. That matters more in practice.
- **"Selenium optional"** is a testing aid, not a delivery requirement. Playwright is the better choice for a Node developer.
- **"Fallback suggestions"** means that when confidence is low, show the user ranked candidate answers to pick from, rather than filling silently or skipping silently.

---

## 2. Requirements, decoded

| Requirement | What it actually means | "Done" looks like |
|---|---|---|
| Resume upload & parsing | PDF and DOCX text extraction in the browser, then structuring | Upload either format and get an editable profile in under ~15s |
| AI resume understanding | LLM turns raw text into schema-validated JSON; normalizes dates, splits names, marks "Present" as current role | Output passes schema validation; unknowns are `null`, never invented |
| Workday form automation | Detect which step you're on and fill every widget type, including repeatable Experience/Education blocks | Each step is filled and advanced without manual help (except auth) |
| AI field mapping | Label → meaning → value, working even when labels are reworded | "Given Name," "Legal First Name," and "First Name" all resolve correctly |
| Custom questions | LLM answers from resume plus an explicit answers profile, with confidence | Yes/No and dropdown questions answered where confident; others flagged |
| Fallback suggestions | Low-confidence fields show top options in the side panel | User clicks a suggestion and it gets applied |
| No overwriting prefilled data | Detect existing values (Workday's own resume autofill, saved drafts) | Valid existing values are kept; conflicts are flagged |
| Validate before submit | Required fields, formats, Workday error banners, date logic | The review screen lists every issue before the Submit button unlocks |
| Review + explicit confirmation | Side-panel summary of every field decision, then a confirm gate | Submit is impossible without a user click |
| MV3, content scripts, service worker | Standard extension structure | The manifest passes; no remote code |
| Adapt beyond hardcoded selectors | Semantic, label-based discovery, with Workday attributes only as hints | It still works if an automation ID disappears |
| MutationObserver | Event-driven waiting instead of `sleep()` | No fixed delays in the fill path |
| Modular Parser/Mapper/Filler/Navigator | Named modules with clean interfaces | The folder structure mirrors this |
| Secure sensitive data | Local-only storage, API key isolated, no PII in logs | Documented in LIMITATIONS |
| Deliverables | Repo, build, 4 docs, demo video naming the selected form | All present; selected form named at the top of the README and the video |

---

## 3. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Complex objects pass between four contexts; types prevent a whole class of bugs |
| Extension framework | **WXT** (Vite-based, MV3-first) | Handles manifest generation, HMR, and entrypoints |
| UI | React in the **Chrome Side Panel** | Persists across Workday page transitions; natural home for the run log and review screen |
| Styling | Tailwind or plain CSS modules | Keep it simple; UX is 5% |
| Validation | Zod | Validates every LLM response and every message between contexts |
| PDF text | pdfjs-dist | Runs in extension pages, not the service worker |
| DOCX text | mammoth | Browser-compatible and small |
| Fuzzy matching | fuse.js | Matches values to dropdown options before involving the LLM |
| LLM | OpenAI or Anthropic via a thin provider adapter, using structured/JSON-schema output | Pick one; keep the adapter an interface |
| Storage | `chrome.storage.local` (profile, settings, cache), IndexedDB (resume file blob), `chrome.storage.session` (live run state) | No server and no database |
| Unit/fixture tests | Vitest + happy-dom | Run the scanner against saved Workday HTML snapshots |
| E2E | Playwright with the unpacked extension in persistent Chromium | Node-native, first-class extension support |

**Why no backend and no Postgres:** all the data is one user's personal info and belongs on their machine. A server adds hosting, auth, stored personal data, and deployment risk, and earns zero grading points. Instead: **bring-your-own-key plus a heuristic-only mode** that still fills standard fields with no key. An Express proxy to hide the API key is an optional stretch goal only.

---

## 4. Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Side panel (React)│ ⇄  │  Service worker  │ ⇄  │   LLM provider   │
│ profile, log,     │     │ router, LLM      │     │ structured JSON  │
│ review, confirm   │     │ gateway, API key │     │ only             │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  ⇅
┌─────────────────────── Content script (Workday tab) ───────────────────┐
│                  Orchestrator (run state machine)                       │
│   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐        │
│   │ Navigator │   │  Scanner  │   │  Mapper   │   │  Filler   │        │
│   │ steps     │   │ fields    │   │ rules + AI│   │ widgets   │        │
│   └───────────┘   └───────────┘   └───────────┘   └───────────┘        │
│                          + Validator                                    │
└───────────────┬───────────────────────────────────────┬────────────────┘
                ⇅                                       ⇅
       ┌─────────────────┐                   ┌──────────────────────────┐
       │   Workday DOM   │                   │ chrome.storage + IndexedDB│
       │ forms, portals  │                   │ profile, cache, run state │
       └─────────────────┘                   └──────────────────────────┘
```

**Responsibilities per context:**

- **Side panel.** Resume upload and parsing (pdf.js and mammoth need a page context, not the service worker), profile editor, answers profile, run controls (Start / Pause / Resume), live field-decision log, low-confidence suggestions, final review and confirm screen.
- **Service worker.** Thin, stateless message router and LLM gateway. The only context that reads the API key. Holds no in-memory state, because Chrome can kill it after ~30s idle.
- **Content script.** Hosts the orchestrator and everything that touches the DOM. Workday is a single-page app, so the script normally survives step changes. On a full reload, the orchestrator rehydrates from `chrome.storage.session`.
- **Storage as the sync bus.** The content script writes run state; the side panel subscribes via `storage.onChanged`. More robust than long-lived ports across contexts.

**Run state machine:**
`IDLE → DETECT_PAGE → (AWAITING_AUTH, user signs in manually) → SCAN_STEP → MAP → FILL → VERIFY → (AWAITING_USER, if blocking low-confidence required fields) → ADVANCE → [loop to SCAN_STEP] → REVIEW → AWAITING_CONFIRMATION → SUBMITTING → DONE`.
Any state can go to `ERROR_RECOVERY` (re-scan, retry up to N, else hand off to user) or `PAUSED`. Every transition is persisted.

**Per-step pipeline:**

1. **Scan.** Produce field descriptors: label, helper text, section and index, widget type, required flag, current value, locator.
2. **Map pass 1.** Deterministic label → canonical key via a synonym dictionary. Instant and free.
3. **Map pass 2.** All unresolved fields for the step go to the LLM in **one batched call**, with resume JSON and answers profile. The LLM must pick values *from the provided option lists*.
4. **Policy layer.** EEO fields only from the answers profile; legal-consent checkboxes never auto-checked; confidence thresholds decide fill / suggest / skip.
5. **Fill.** Matching widget handler, then read back the value to verify.
6. **Validate.** Workday inline errors plus our own checks.
7. **Advance.**

**Locator strategy (the "beyond hardcoded selectors" requirement):**

1. Accessible semantics: role plus accessible name via `aria-labelledby`, `<label for>`, `aria-label`, fieldset legend.
2. Workday `data-automation-id` attributes, used as *hints* that raise confidence, not the only path.
3. Structural proximity: nearest preceding label text within the same form-field container.

Record which layer matched in the debug log.

**Hard rule:** the AI only returns *data* (values, option choices, confidence), never selectors or code. MV3 forbids remote code anyway, and this blocks prompt injection from job-page text.

---

## 5. Data and API structure (no database)

**Storage layout:**

| Store | Key | Contents |
|---|---|---|
| `storage.local` | `settings` | Provider, model names, API key, confidence threshold, overwrite-prefilled flag, auto-advance flag |
| `storage.local` | `profile` | Parsed and user-edited resume profile |
| `storage.local` | `answers` | User-declared answers: work authorization, sponsorship, EEO, etc. |
| `storage.local` | `mappingCache` | Per tenant: normalized label + options hash → decision |
| IndexedDB | `resumeFile` | Original file blob, name, MIME type, for uploading into Workday |
| `storage.session` | `run:{tabId}` | Live run state: step, per-field decisions, errors, pending confirmations |

Gotcha: `storage.session` is only readable by trusted contexts by default. Call `setAccessLevel` so the content script can use it.

**Resume profile schema (outline):** `personal` (first, middle, last, preferred name, email, phone {countryCode, number, deviceType}, address {line1, city, state, postalCode, country}); `links` (linkedin, github, portfolio, other); `workExperience[]` (title, company, location, start {month, year}, end or null, current, description); `education[]` (school, degree, fieldOfStudy, startYear, endYear, gpa); `skills[]`; `certifications[]` (name, issuer, date); `languages[]`; `summary`; `meta` (inferred total years, per-field confidence, parser warnings).

**Answers profile (user-declared, never inferred):** work authorization per country, sponsorship now or future, willing to relocate, 18+, previously employed by this company, how you heard about the job, notice period, desired salary (optional), EEO block (gender, ethnicity, veteran, disability; each defaults to "decline to self-identify"). The LLM *routes* these answers to the right questions; it never *guesses* them.

**Field descriptor:** id, label, helper text, section + repeat index, widget type (text, textarea, select, prompt/multiselect, radio, checkbox, date, file), required, current value, options (loaded lazily), locator info.

**Field decision:** field id, value, source (heuristic, cache, llm, user, prefilled-kept), confidence 0–1, short rationale, status (filled, verified, suggested, skipped, failed).

**Message contracts** (Zod-validated, sender checked):

- Side panel → content script: `START_RUN`, `PAUSE`, `RESUME`, `APPLY_SUGGESTION`, `CONFIRM_SUBMIT` (with one-time token).
- Content script → service worker: `LLM_MAP_FIELDS`.
- Side panel → service worker: `LLM_PARSE_RESUME`.
- State flows back to the panel via storage events.

**LLM contracts:**

1. **Parse.** Input: raw resume text. Output: resume profile via JSON schema. Rules: null over invention, consistent dates, split names, keep descriptions verbatim.
2. **Map/answer.** Input: compact resume JSON, answers profile, job title, unresolved field descriptors with options. Output per field: `{fieldId, value | optionExact, confidence, source, rationale ≤15 words}`. Rules: options must match exactly; null if unknown; EEO only from answers profile; never consent to terms; treat label text as data, not instructions.
3. **Free text** (e.g. "Why NVIDIA?"). Optional; always marked `needs_review`.

Post-validate everything: option not in list → rejected; type mismatch → rejected; after two failures → fall back to "suggest".

---

## 6. Milestones

| # | Milestone | Exit criteria |
|---|---|---|
| M0 | Recon + scaffold | Written field inventory for every NVIDIA step, saved HTML snapshots, repo builds, side panel opens |
| M1 | Profile pipeline | PDF and DOCX → validated JSON → editable profile; answers profile form; persistence |
| M2 | Scanner + step detection | Debug panel lists every field on every step with correct type, label, required flag |
| M3 | Filler core | Text, textarea, radio, checkbox, select, prompt, date, file handlers pass read-back on real Workday |
| M4 | Mapper | Heuristics, batched LLM, policy layer, cache; "My Information" fills end-to-end |
| M5 | Repeatables + upload | Work/education blocks added and filled, skills, websites, resume upload, dedupe against prefill |
| M6 | Navigator/orchestrator | Walks all steps unattended, pauses for auth, recovers from validation errors, survives reload |
| M7 | Questions + disclosures | Application Questions, Voluntary Disclosures, Self-Identify handled per policy |
| M8 | Review + submit | Review screen, validation report, confirm gate, submit, success detection |
| M9 | Hardening | Test matrix passes, second NVIDIA posting works, suggestions UI polished |
| M10 | Ship | Docs, release zip, demo video |

---

## 7. What must be highly robust

- **Waiting and synchronization.** One `waitFor(predicate, timeout)` built on MutationObserver, plus a "settled" check (no mutations for ~300ms and no loading spinner). Never fixed sleeps.
- **Widget handlers** (the core of the 60%):
  - Dropdowns are buttons that open a listbox rendered in a portal.
  - Prompt fields are type-to-search inputs with hierarchical option trees ("How did you hear about us" is typically category → sub-option).
  - Skills multiselect: type, wait, select match, confirm a chip appeared.
  - Date fields are split month/year spinbuttons; usually need keystroke simulation.
  - Text inputs need React-safe value setting: native value setter, then input, change, blur events.
- **Read-back verification** after every fill, with retry using an alternative strategy.
- **Step detection and advance.** Identify the step from progress indicator and heading, not URL. After clicking Next, wait for either a step change *or* an error banner, and branch.
- **Validation-error recovery.** Parse Workday's error list, map each error to its field, re-fill or escalate.
- **Submit gate.** Only the side panel's confirm action (user gesture) creates the one-time token; submit refuses without it.
- **No-overwrite logic and prefill dedupe.** Workday's "Autofill with Resume" often creates messy or duplicated entries.
- **EEO and legal policy.** Impossible to infer protected attributes.
- **LLM output validation.** Schema check, option-membership check, fallback.
- **State persistence** across reloads and service worker restarts.

---

## 8. What can stay simple

- UI: clean and functional, no design polish.
- No backend, no database, no auth system.
- One LLM provider behind an adapter interface.
- One tenant (NVIDIA). Keep code tenant-agnostic, but only test NVIDIA seriously.
- No OCR; scanned PDFs are a documented limitation.
- One profile only.
- API key in plain `storage.local` with documented caveats (passphrase encryption is a stretch goal).
- Cover letters / essays: skip or suggest-only.
- No analytics, telemetry, or Chrome Web Store publishing.

---

## 9. Edge cases and risks

**Highest-impact risks:**

| Risk | Impact | Mitigation |
|---|---|---|
| Assignment posting links have closed | Can't test the named form | Check on day 1. Flow is per tenant; any live NVIDIA posting works. Document the exact URL |
| **One submission per posting per account** | Can't rehearse the final submit | Iterate up to Review freely. Save Submit for the recorded demo, or rehearse on a second live posting |
| Real submission reaches NVIDIA recruiters | Noise for them; carries your name | Use genuine details for a role you'd actually consider |
| Synthetic events ignored (`isTrusted` false) | A field can't be filled | Try alternate event sequences first. Last resort: `chrome.debugger` API for trusted input (extra permission, shows a banner) |
| Service worker killed mid-LLM-call | Hung run | Stateless worker, timeouts + retries, state in storage. Consider making LLM calls from the side panel if this bites |
| Account creation / email verification | Blocks the flow | Detect, pause, prefill email only; user completes auth |
| LLM hallucinated option/value | Wrong data | Exact-option enforcement, confidence gating, review screen |
| Workday UI differs by window width | Different layout | Test at the same window size used for the demo recording |

**DOM and rendering:**

- Dropdown options render in portals; close them after reading.
- Lazy options, possibly hundreds (country, state) → use typeahead, not scrolling.
- Stale element references after re-render → always re-resolve by locator before acting.
- Repeatable blocks get unique IDs.
- Conditional fields appear after an answer → re-scan after every radio/select fill.
- Modals: "Are you sure?", session-expiry prompts.
- Open shadow roots and same-origin iframes need traversal.

**Data:**

- Missing end date (current job); month-only or year-only dates.
- Non-US phone formats and country codes.
- Multiple degrees, or none.
- Skills not in Workday's skill list.
- Long role descriptions hitting character limits.
- Two-column PDF resumes garbling reading order (LLM usually recovers; test it).
- Names with particles or single names.
- Address given as city only.

**Flow:**

- Entry options: "Autofill with Resume", "Apply Manually", "Use My Last Application". Support manual as primary; handle the others via prefill detection.
- Returning to a saved draft; pressing Back to a previous step.
- Session timeout.
- "Already applied" state.
- Terms and conditions checkbox → flag for user, don't auto-check.
- Disability self-ID form (usually name, today's date, status choice).

**AI:**

- Latency → one batched call per step.
- Cost → cache + heuristic pre-pass.
- Prompt injection in question text → treat as data, schema-constrained output.
- Inconsistent answers across runs → cache makes them deterministic.
- No API key → heuristic-only mode.

**Security:**

- No PII in `console.log`; use a redacting logger.
- Minimal permissions: `storage`, `sidePanel`, `scripting`, host permissions for `*.myworkdayjobs.com` and the LLM host.
- Validate message senders.
- Never send the API key to the content script.

---

## 10. Detailed implementation roadmap

**Phase 0: Recon (highest-ROI step; don't skip).**

1. Create the NVIDIA account.
2. Walk the whole application via "Apply Manually".
3. For every step, record in `docs/recon/`: step name, every field's label, widget type, required flag, `data-automation-id`, how options load, what errors look like and where, Next button text and ID.
4. Save `outerHTML` snapshots of each step, plus one with a dropdown open (to capture portal markup).
5. Repeat once via "Autofill with Resume" to see what Workday prefills.
6. Scaffold the repo (WXT + React + TS); confirm the side panel opens on Workday pages.

**Phase 1: Profile.**

1. Upload UI.
2. Text extraction with pdf.js and mammoth.
3. Parse prompt with JSON schema output; validate with Zod.
4. Editable profile form and answers profile form (work authorization, EEO with decline defaults).
5. Persist everything; resume blob in IndexedDB.

**Phase 2: Scanner.**

1. Label resolution (layered strategy) and widget classification.
2. Required-flag detection; section/repeat-index detection.
3. "Scan this page" debug button rendering descriptors in the side panel.
4. Unit tests against saved snapshots.

**Phase 3: Filler.**

1. Shared DOM utilities: `waitFor`, settle detection, React-safe value set, click and keystroke simulation.
2. One handler per widget type, each with read-back verification.
3. Manual "fill this field with X" debug tool to test handlers without the mapper.

**Phase 4: Mapper.**

1. Canonical key registry (~40 keys) with synonym lists and label normalization.
2. Fuzzy option matching.
3. One batched LLM call per step for unresolved fields.
4. Policy layer and cache.
5. Target: My Information fills completely with no clicks.

**Phase 5: Repeatables and upload.**

1. Resume upload via DataTransfer onto the file input, or simulated drop on the drop zone.
2. Detect existing blocks, then add, fill, dedupe (fuzzy match on company + title).
3. Skills multiselect and website entries.

**Phase 6: Orchestrator and navigator.**

1. State machine, step detector, advance-and-wait-for-outcome.
2. Parse errors and route back to the relevant field.
3. Pause/resume, auth detection and pause, persistence/rehydration.

**Phase 7: Questions and disclosures.** Application Questions (mostly Yes/No selects via answers profile), Voluntary Disclosures, Self-Identify; confidence policy and suggestions UI.

**Phase 8: Review and submit.**

1. Review screen grouped by step: every decision's value, source, confidence; issues highlighted.
2. Validation report.
3. Confirm modal (e.g. "I have reviewed and want to submit to NVIDIA — [job title]").
4. Token-gated submit; detect the success page.

**Phase 9: Hardening.** Run the test matrix, fix flaky waits, run a second posting, throttled network, reload mid-step.

**Phase 10: Ship.** Docs, release zip, demo video.

---

## 11. Testing and QA strategy

**Test layers:**

1. **Unit (Vitest).** Label normalization, synonym matching, fuzzy option matching, date/phone formatting, schema validation, policy rules. Lots of fast tests.
2. **Fixture tests (Vitest + happy-dom).** Run the scanner against saved Workday snapshots; assert the field inventory matches. Regression net for refactors and great context for AI agents. Tests discovery only, not widget behavior.
3. **Mapping accuracy eval.** Golden set of ~60–100 (label, options) → expected answer pairs from real NVIDIA labels plus paraphrased variants. Run heuristic-only and heuristic+LLM; report precision. Goes straight into the docs (addresses the 25% criterion).
4. **Parsing eval.** Hand-labeled JSON for 4–5 resumes: single-column PDF, two-column PDF, DOCX, sparse, dense senior. Compare field by field.
5. **E2E (Playwright, persistent context with the unpacked extension).** Use a profile directory where the user signed in manually (auth not bypassed). Run from job page to Review page; assert every step completed. Run daily. Never automate the final submit in tests.

**Manual QA matrix:** resumes (3) × entry path (manual, Workday autofill, last application) × state (fresh vs resumed draft) × conditions (normal, "Slow 4G" throttling, reload mid-step, side panel closed mid-run, service worker killed via `chrome://serviceworker-internals`).

**Metrics for the docs:** field fill rate, verified-correct rate, steps completed without intervention, mean run time, LLM calls per run.

---

## 12. Deployment and submission plan

- **Build:** `wxt build` then `wxt zip`. Attach the zip to a GitHub Release (v1.0.0). No Chrome Web Store.
- **README first line:** "Selected and tested form: NVIDIA — [posting title + exact URL]." Then a 60-second quick start: load unpacked, add API key, upload resume, fill answers, open posting, sign in, click Start.
- **Docs:** `SETUP.md`, `ARCHITECTURE.md` (diagram, state machine, module contracts), `AI_STRATEGY.md` (two-pass mapping, prompts, confidence policy, cache, EEO policy, eval results), `LIMITATIONS.md` (manual auth, no OCR, single tenant tested, key storage caveats, free-text needs review), `TESTING.md`.
- **Demo video (5–8 min):**
  1. State the selected form.
  2. Upload resume; show parsed profile.
  3. Show the answers profile.
  4. Open the posting and sign in manually, saying auth is not bypassed.
  5. Click Start; side panel log shows fields filling with sources and confidence.
  6. Accept one low-confidence suggestion.
  7. Show one error recovery if it happens naturally.
  8. Review screen → confirm modal → Submit → success page.

  Record in one take if possible, blur personal info, and keep a backup recording up to the Review step in case the live submit misbehaves.

---

## 13. Workflow with AI coding agents

**Set up once:**

- `CLAUDE.md` at repo root: goal, selected tenant, module boundaries, hard rules, commands, definition of done.
- `docs/recon/` with field inventory and HTML snapshots. **Agents hallucinate Workday's DOM confidently** — always give real snapshots.
- `docs/DECISIONS.md`: one line per non-obvious choice, so agents stop re-litigating.

**Per-task loop:**

1. **Brief.** Goal, inputs/outputs, files it may touch, acceptance criteria, relevant snapshot.
2. **Plan first.** Agent plans without coding; review and cut scope.
3. **One vertical slice** (e.g. "the dropdown handler", not "all handlers").
4. **Test.** Agent writes/updates unit and fixture tests.
5. **Verify** on real Workday yourself.
6. **Debug packet** when something fails: expected vs observed, console log, relevant DOM snippet (field container *and* portal), which handler ran.
7. **Commit** when green. One task per session.

**Watch agents for:** `setTimeout` sleeps, snapshot selectors as the *only* strategy, Chrome APIs in the wrong context (DOM in service worker, `chrome.tabs` in content script), swallowed errors, "fixes" that special-case one label.

---

## 14. Where the time will go (~70 focused hours; scale to your deadline)

| Area | Share | ~Hours | Why |
|---|---|---|---|
| Filler / widget handlers | 25% | 18 | Each tricky widget has quirks found only by trying |
| Orchestrator + navigator + error recovery | 15% | 10 | Timing, branching, persistence |
| Mapper (heuristics + LLM + policy + cache) | 12% | 8 | Prompts are quick; policy and eval take time |
| Repeatables + upload + prefill dedupe | 10% | 7 | Workday's autofill prefill is messy |
| Scanner + step detection | 8% | 6 | Label resolution edge cases |
| Recon + scaffold | 7% | 5 | Pays for itself many times over |
| Resume parsing | 6% | 4 | Mostly solved by pdf.js + LLM |
| Side panel UI + review screen | 7% | 5 | Keep it plain |
| Testing, evals, hardening | 5% | 4 | Ongoing plus one dedicated pass |
| Docs + video + release | 5% | 3 | Don't leave it to the last evening |

Biggest sink: widget handlers that work 90% of the time. Budget explicitly for the last 10%.

---

## 15. Prioritization

- **Must:** complete NVIDIA flow to Review with no manual help except auth; every widget type; heuristic + LLM mapping; review screen, confirm gate, submit; resume parse with edit; answers profile (EEO, work authorization); docs and video.
- **Should:** error recovery; mapping cache; suggestions UI; prefill dedupe; heuristic-only mode without a key; mapping accuracy numbers.
- **Could:** Target tenant sanity run; encrypted key storage; free-text answer drafting; Express proxy.
- **Won't:** OCR, automated account creation, multi-tenant guarantees, Web Store publishing.

**If time gets tight:** protect the end-to-end flow above everything (60% of the grade). Cut suggestions UI polish, the Target run, and eval breadth first. Never cut the review/confirm gate or the EEO policy — those are explicit constraints.

---

## READY TO START

**Stack:** TypeScript, WXT (Vite, MV3), React side panel, Zod, pdfjs-dist, mammoth, fuse.js, one LLM provider (OpenAI or Anthropic) behind an adapter with structured JSON output, `chrome.storage` + IndexedDB, Vitest + happy-dom, Playwright. No backend, no database.

**Architecture:** Side panel (UI, parsing, review, confirm) ↔ service worker (stateless router, sole holder of the API key, LLM gateway) ↔ content script (Orchestrator driving Navigator, Scanner, Mapper, Filler, Validator). State in `storage.session`, synced to UI via `storage.onChanged`. Two-pass mapping (heuristics, then one batched LLM call per step) + policy layer + cache. AI returns data only. Submit gated by a one-time token from the user's confirm click.

**Implementation order:**

1. Recon + scaffold
2. Profile pipeline
3. Scanner
4. Filler core
5. Mapper
6. Repeatables + upload
7. Orchestrator/navigator
8. Questions + disclosures
9. Review + submit
10. Hardening
11. Docs + release + video

**Time (~70h):** Filler 18 · Orchestrator/navigator 10 · Mapper 8 · Repeatables 7 · Scanner 6 · Recon 5 · UI 5 · Parsing 4 · Testing/hardening 4 · Docs/video 3.
