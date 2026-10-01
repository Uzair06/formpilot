// End-to-end check of the whole autofill flow on an NVIDIA-style fake Workday application.
// Loads the built extension in Chromium, serves tests/e2e/fake-workday.html at a myworkdayjobs.com
// address (so the content script runs), and answers Gemini calls with a small fake (no real API use).
// Run: npm run test:e2e   (needs `npx playwright install chromium` once)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const html = readFileSync(resolve(here, 'fake-workday.html'), 'utf8');
const expected = readFileSync(resolve(root, 'tests/fixtures/resumes/alex-rivera.expected.ts'), 'utf8');
const profile = eval(`(${expected.slice(expected.indexOf('= {') + 2, expected.lastIndexOf('};') + 1)})`);
profile.links.linkedin = 'https://linkedin.com/in/alex-rivera-example'; // short form Workday rejects
profile.education[1].fieldOfStudy = 'Computer Science and Engineering'; // not in the list: AI must pick a real option
const resumePdf = readFileSync(resolve(root, 'tests/fixtures/resumes/alex-rivera.pdf'));
const ext = resolve(root, '.output/chrome-mv3');

// Fake Gemini: answers the mapping call the way a good model would, for the fields this page sends.
function fakeGemini(body) {
  const { fields } = JSON.parse(body.contents[0].parts[0].text);
  const answers = fields.map((f) => {
    if (/field of study/i.test(f.label) && f.options?.includes('Computer Engineering')) {
      return { id: f.id, value: 'Computer Engineering', confidence: 0.8, reason: 'Closest to Computer Science and Engineering' };
    }
    if (/degree/i.test(f.label)) {
      const wanted = /1$/.test(f.section) ? "Master's Degree" : "Bachelor's Degree";
      // Like a real model: exact wording only if it was shown the options, otherwise a vague guess.
      const value = f.options?.includes(wanted) ? wanted : wanted.replace(' Degree', '');
      return { id: f.id, value, confidence: 0.9, reason: 'M.S. / B.S. on resume' };
    }
    return { id: f.id, value: null, confidence: 0, reason: 'Not in the resume' };
  });
  return { candidates: [{ content: { parts: [{ text: JSON.stringify({ answers }) }] }, finishReason: 'STOP' }] };
}

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failed = true;
};
let aiCalls = 0;
try {
  await ctx.route('https://fake.myworkdayjobs.com/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    aiCalls++;
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(fakeGemini(route.request().postDataJSON())) });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(
    async ({ p, pdf }) => {
      await chrome.storage.local.set({
        geminiApiKey: 'fake-key-for-tests',
        resumeProfile: p,
        answersProfile: {
          workAuthorized: 'yes', needsSponsorship: 'no', willingToRelocate: null, over18: 'yes', previouslyWorkedAtCompany: 'no',
          howDidYouHear: 'LinkedIn', noticePeriod: '', desiredSalary: '',
          eeo: { gender: 'decline', ethnicity: 'decline', veteran: 'decline', disability: 'decline' },
        },
      });
      // The resume file, as the side panel would have saved it.
      const bytes = new Uint8Array(pdf).buffer;
      await new Promise((ok, bad) => {
        const open = indexedDB.open('formpilot', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('files');
        open.onerror = () => bad(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('files', 'readwrite');
          tx.objectStore('files').put({ name: 'alex-rivera.pdf', mimeType: 'application/pdf', bytes, text: 'Alex', links: [], savedAt: 1 }, 'resume');
          tx.oncomplete = () => ok();
        };
      });
    },
    { p: profile, pdf: [...resumePdf] },
  );

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://fake.myworkdayjobs.com/apply');
  await page.bringToFront();
  const ask = (type) => sw.evaluate(async (type) => chrome.tabs.sendMessage((await chrome.tabs.query({ active: true }))[0].id, { type }), type);
  const waitRun = (busy) =>
    sw.evaluate(
      (busy) => new Promise((done) => {
        const poll = async () => {
          const { runState } = await chrome.storage.local.get('runState');
          if (runState && !busy.includes(runState.status)) done(runState);
          else setTimeout(poll, 250);
        };
        setTimeout(poll, 250);
      }),
      busy,
    );
  const report = (run, title) => run.pages.find((p) => p.page.title === title)?.fields ?? [];
  const shown = (fields, label) => fields.filter((f) => f.label === label && f.outcome === 'filled').map((f) => f.shownValue);
  const one = (fields, label) => fields.find((f) => f.label === label);

  // --- Run until it needs the user (the Terms checkbox on Voluntary Disclosures) ---
  await ask('runAll');
  const stop = await waitRun(['running', 'idle']);
  check(stop.status === 'needs_user' && /Voluntary Disclosures/.test(stop.message) && /Terms and Conditions/.test(stop.message), `runs through to the Terms checkbox (${stop.status}: ${stop.message})`);

  const info = report(stop, 'My Information');
  check(one(info, 'How Did You Hear About Us?')?.shownValue === 'LinkedIn', 'How Did You Hear About Us → LinkedIn');
  check(one(info, 'Have you previously worked for NVIDIA as an employee or contractor?')?.shownValue === 'No', 'previously worked for NVIDIA → No');
  check(one(info, 'Country')?.source === 'prefilled', 'Country already set → kept');
  check(one(info, 'Given Name(s)')?.shownValue === 'Alex' && one(info, 'Family Name')?.shownValue === 'Rivera', 'legal name filled');
  check(!one(info, 'Local Given Name(s)')?.outcome && !one(info, 'Local Family Name')?.outcome, 'local-script names left empty');
  check(!one(info, 'I have a preferred name')?.outcome, 'preferred-name box left unticked');
  check(one(info, 'City')?.shownValue === 'San Jose' && one(info, 'Postal Code')?.shownValue === '95112', 'address filled');
  check(one(info, 'State')?.outcome !== 'filled', 'State with no matching option is not forced');
  check(one(info, 'Email Address')?.source === 'prefilled', 'account email kept');
  check(one(info, 'Phone Device Type')?.shownValue === 'Mobile', 'Phone Device Type → Mobile');
  check(one(info, 'Country Phone Code')?.source === 'prefilled', 'Country Phone Code already set → kept');
  check(one(info, 'Phone Number')?.shownValue === '(555) 010-0142', 'phone number filled');

  const exp = report(stop, 'My Experience');
  check(JSON.stringify(shown(exp, 'Job Title')) === '["Senior Software Engineer","Software Engineer"]', `one entry per job (${JSON.stringify(shown(exp, 'Job Title'))})`);
  check(JSON.stringify(shown(exp, 'Company')) === '["Example Compute Inc.","Sample Storage Systems"]', 'companies filled per job');
  check(JSON.stringify(shown(exp, 'From')).includes('03/2022') && JSON.stringify(shown(exp, 'From')).includes('06/2019'), `job start dates (${JSON.stringify(shown(exp, 'From'))})`);
  check(JSON.stringify(shown(exp, 'To')).includes('02/2022'), 'end date only for the past job');
  check(!/From|To/.test(stop.message), 'dates count as filled on the page (focus left the date box)');
  check(JSON.stringify(shown(exp, 'School or University')) === '["University of Example","Sample State University"]', 'one entry per school');
  check(JSON.stringify(shown(exp, 'Degree')) === `["Master's","Bachelor's"]`, `degree M.S./B.S. → the form's wording (${JSON.stringify(shown(exp, 'Degree'))})`);
  check(JSON.stringify(shown(exp, 'Field of Study')) === '["Computer Science","Computer Engineering"]', `field of study for both schools, AI picks a real option when needed (${JSON.stringify(shown(exp, 'Field of Study'))})`);
  check(exp.some((f) => /Overall Result/.test(f.label) && /rejected/.test(f.reason)), 'optional GPA rejected by the page → cleared, run continued');
  check(shown(exp, 'Type to Add Skills')[0] === 'C++, Python, CUDA, MPI, Kubernetes, Linux', `several skills typed and picked (${shown(exp, 'Type to Add Skills')[0]})`);
  const skillsOnPage = await page.evaluate(() => window.__skillsOnPage);
  check(JSON.stringify(skillsOnPage) === '["C++","Python","CUDA","MPI","Kubernetes","Linux"]', `all skills still on the page when leaving it (${JSON.stringify(skillsOnPage)})`);
  check(!/No fields found|did not change|errors/.test(stop.message), 'moved from page to page by itself (slow load + "Saving…" message)');
  check(one(exp, '')?.outcome === 'filled' || exp.some((f) => f.reason === 'Your resume file' && f.outcome === 'filled'), 'resume file uploaded');
  check(JSON.stringify(shown(exp, 'URL')) === '["https://github.com/alex-rivera-example","https://alexrivera.example.com"]', `websites added (${JSON.stringify(shown(exp, 'URL'))})`);
  check(one(exp, 'Please provide a link to your LinkedIn profile:')?.shownValue === 'https://www.linkedin.com/in/alex-rivera-example', 'LinkedIn filled');

  const qs = report(stop, 'Application Questions');
  check(one(qs, 'Are you legally authorized to work in the United States?')?.shownValue === 'Yes', 'work authorization → Yes');
  check(one(qs, 'Will you now or in the future require sponsorship for employment visa status (e.g. H-1B visa status)?')?.shownValue === 'No', 'sponsorship → No (keyboard-only drop-down)');

  const vd = report(stop, 'Voluntary Disclosures');
  check(one(vd, 'What is your ethnicity?')?.shownValue === 'I do not wish to answer', 'ethnicity → decline');
  check(one(vd, 'What is your gender?')?.shownValue === 'I do not wish to answer', 'gender → decline');
  check(vd.some((f) => /protected veterans/.test(f.label) && f.shownValue === "I don't wish to answer"), 'veteran → decline');
  check(vd.some((f) => /Terms and Conditions/.test(f.label) && f.status === 'flag'), 'Terms checkbox flagged for the user');
  check(!(await page.locator('#terms').isChecked()), 'Terms checkbox NOT ticked by FormPilot');
  check(aiCalls > 0, `AI used for fields rules can't settle (${aiCalls} calls)`);

  // --- The user ticks Terms and presses Continue ---
  await page.locator('#terms').check();
  await ask('runAll');
  const review = await waitRun(['running', 'idle']);
  check(review.status === 'review', `Continue → reaches Review (${review.status})`);
  check((await page.locator('h2').innerText()) === 'Review', 'nothing submitted without confirmation');

  await ask('submitApplication');
  const after = await waitRun(['submitting', 'review']);
  check(after.status === 'done', `submits only when the user confirms (${after.status})`);
} finally {
  await ctx.close();
}
process.exit(failed ? 1 : 0);
