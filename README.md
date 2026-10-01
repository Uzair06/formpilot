# FormPilot

An AI-assisted Chrome extension (Manifest V3) that fills **Workday** job applications from your resume, page by page, and submits **only after you confirm**.

**Selected and tested form: NVIDIA** —
https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Senior-HPC-Storage-Engineer_JR2014997

FormPilot finds fields by their visible label rather than hard-coded selectors, so it is built to work on other Workday career sites too. It was tested on NVIDIA.

## What it does

1. **Resume → profile.** Upload a PDF or DOCX. The text is extracted locally, and Gemini turns it into structured JSON: contact details, links, jobs, schools, skills, certifications and languages. You can review and edit every field.
2. **Answers.** You answer the questions only you can answer: work authorization, sponsorship, relocation, age, how you heard about the job, and optional EEO choices (default: decline). These are never guessed.
3. **Autofill.** Press **Fill all pages** while on a Workday job page. FormPilot then does the following:
   - It clicks Apply, then Apply Manually.
   - It **pauses for you to sign in**, and continues once you have.
   - On every step it fills text boxes, drop-downs, search boxes, dates, radio buttons, checkboxes, repeatable Work Experience / Education entries, and the resume upload. Then it clicks **Save and Continue**.
4. **Review.** On the Review page, it lists what was filled, what the AI suggested, and what needs you. Nothing is submitted until you press **Confirm and submit**, then **Yes, submit**.

## Docs

- [Setup](docs/SETUP.md): install, load, and run
- [Architecture](docs/ARCHITECTURE.md): how the parts fit together
- [AI strategy](docs/AI_STRATEGY.md): parsing, field mapping, and safety rules
- [Limitations](docs/LIMITATIONS.md): known gaps and trade-offs
- [Decisions](docs/DECISIONS.md): one-line log of non-obvious choices
- [Recon](docs/recon/README.md): notes on the NVIDIA Workday flow

## Quick start

```bash
npm install
npm run build        # → .output/chrome-mv3 (load it as an unpacked extension)
npm run zip          # → .output/formpilot-<version>-chrome.zip
npm test             # unit tests (offline)
npm run test:e2e     # full flow on a fake Workday page in Chromium
```

Then open **Settings** in the side panel and paste a Gemini API key.
