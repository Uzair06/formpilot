# Limitations

Known gaps and trade-offs, written honestly. This was built in a 3-day window.

## Scope and testing

- **Tested company: NVIDIA**, with the posting in the README. The code doesn't depend on NVIDIA: it finds fields by label, and Workday's `data-automation-id` is only a hint. Other Workday career sites should work the same way, but they were not part of this test. Their custom questions and option wording will differ.
- Automated end-to-end tests run on a **copy of the NVIDIA application's pages** (`tests/e2e/fake-workday.html`, with a fake Gemini). Workday's own widgets are imitated, not copied. Real Workday behaviour was checked by hand on the NVIDIA site. Real Workday only allows **one submission per job per account**, so the submit step could be tried for real only once.
- Workday changes its UI over time. Label-first matching and ARIA-based widget handling (`role="listbox"` / `option`) reduce breakage, but they can't remove it.

## Resume parsing

- **Scanned or image-only PDFs are not supported** (no OCR). The user gets a clear message.
- Old `.doc` files are not supported. Save them as `.docx` or PDF.
- Unusual layouts (tables, text boxes, heavy two-column designs) can come out in a jumbled order. The AI and the user's review step usually fix this.
- The resume **text is sent to Google Gemini**, which AI parsing requires. Nothing else leaves the browser, apart from field labels and the profile during mapping.

## Autofill

- **Sign-in and account creation are always manual** (by design). So is email verification.
- Workday "prompt" search boxes with deeply nested categories are handled up to 3 levels. If the search wording doesn't match any option, the field is reported for the user.
- Date fields are filled through Workday's month/day/year boxes. Unusual date widgets may need manual entry; they show as "failed" in the report.
- File upload uses the standard file input with a `DataTransfer`. If a tenant only accepts drag-and-drop, the user must upload by hand.
- Repeatable sections: FormPilot adds Work Experience, Education and Websites entries to match the profile. Other repeatable sections some forms have (Languages, Certifications) are only filled where entries already exist.
- If Workday pre-fills a field (e.g. from "Autofill with Resume"), FormPilot keeps that value rather than overwriting it, even if the profile differs.
- Questions FormPilot can't answer confidently are left for the user and listed in the side panel. The assignment says not every question is expected to be completed.
- A run left mid-way resumes after a page load only within 10 minutes; after that, press "Fill all pages" again.

## AI

- AI answers can be wrong. Guardrails: options must be real, confidence thresholds, suggestions instead of guesses, EEO and sensitive questions never sent, and everything listed for review before submitting.
- It depends on Gemini availability and quota. On "high demand" (503) errors, FormPilot retries twice, then reports the error. Another model can be picked in Settings. The rules still fill the standard fields without the AI.
- The model alias `gemini-flash-latest` can change behind the scenes when Google releases a new model. Pin a specific model in Settings for repeatable results.

## Not built (time)

- A cache of mapping decisions between runs
- Multiple profiles, or per-company answers (e.g. "worked here before" is one global answer)
- A separate "review screen" page. The review is the side panel's report next to Workday's own Review page.
