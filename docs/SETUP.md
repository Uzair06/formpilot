# Setup

## Requirements

- Node.js 20+ (developed on Node 24) and npm
- Google Chrome (or any Chromium browser that supports Manifest V3 and the Side Panel API)
- A Google **Gemini API key**. Get one at https://aistudio.google.com/

## Install and build

```bash
git clone <repo-url> formpilot
cd formpilot
npm install
npm run build
```

The built extension is in `.output/chrome-mv3/`.

## Load it in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `.output/chrome-mv3` folder.
3. Pin FormPilot in the toolbar. Clicking its icon opens the **side panel**.

To get a zip for the Chrome Web Store, or to share the build, run `npm run zip`. That creates `.output/formpilot-<version>-chrome.zip`.

For development with live reload, run `npm run dev`. It opens a separate Chrome profile with the extension loaded.

## First run

1. In the side panel, click **Settings**. Paste your Gemini key and click **Save**.
   - "Key works" should appear.
   - The model defaults to `gemini-flash-latest`. You can pick another model from the list.
2. **Resume** tab: upload your resume as a PDF or DOCX. Check the parsed profile and fix anything wrong. Changes save automatically.
3. **Answers** tab: answer the yes/no questions and "How did you hear about us". Set the EEO choices if you want; they default to "Decline to self-identify".
4. Open a Workday job posting, such as the NVIDIA link in the README. Then go to the **Autofill** tab and press **Fill all pages**.
   - When asked, sign in or create the account yourself. FormPilot continues afterwards.
   - It stops at **Review**. Check the page and the list in the side panel, then press **Confirm and submit**, then **Yes, submit**.

If the Autofill tab says "Open a Workday job application page…", refresh the Workday tab once. Pages that were open before the extension was installed or reloaded don't have FormPilot in them yet.

## Tests

| Command | What it runs |
|---|---|
| `npm test` | 115 unit and component tests (Vitest + happy-dom), fully offline |
| `npm run test:e2e` | Builds the extension and runs the whole flow in Chromium on `tests/e2e/fake-workday.html`, a copy of the **NVIDIA application's pages and fields** served at a `myworkdayjobs.com` address. Gemini is replaced by a small fake. 35 checks cover every field type, repeatable entries, resume upload, AI-chosen options, EEO, Terms, Continue, Review and confirm-to-submit. Needs `npx playwright install chromium` once. |
| `GEMINI_API_KEY=… npm run test:live` | Parses the fake test resume with the real Gemini API and checks the result. `GEMINI_MODEL=…` is optional. |
| `npm run compile` | TypeScript type check |

All test resumes in `tests/fixtures/resumes/` are fake.
