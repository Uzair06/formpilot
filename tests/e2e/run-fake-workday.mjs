// End-to-end check: loads the built extension in Chromium, serves tests/e2e/fake-workday.html at a
// myworkdayjobs.com address (so the content script runs), then runs "Fill all pages" and "submit".
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
const ext = resolve(root, '.output/chrome-mv3');

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
try {
  await ctx.route('https://fake.myworkdayjobs.com/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(
    (p) =>
      chrome.storage.local.set({
        resumeProfile: p,
        answersProfile: {
          workAuthorized: 'yes', needsSponsorship: 'no', willingToRelocate: null, over18: 'yes', previouslyWorkedAtCompany: 'no',
          howDidYouHear: 'LinkedIn', noticePeriod: '', desiredSalary: '',
          eeo: { gender: 'decline', ethnicity: 'decline', veteran: 'decline', disability: 'decline' },
        },
      }),
    profile,
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

  await ask('runAll');
  const run = await waitRun(['running', 'idle']);
  const fields = Object.fromEntries(run.pages.flatMap((p) => p.fields).map((f) => [f.label, f]));
  check(run.status === 'review', `stops at Review (status: ${run.status} — ${run.message})`);
  check(fields['Given Name(s)']?.shownValue === 'Alex', 'fills text boxes');
  check(fields['Phone Device Type']?.shownValue === 'Mobile', 'fills a Workday-style drop-down');
  check(fields['How Did You Hear About Us?']?.outcome === 'filled', 'fills a search-as-you-type box');
  check(fields['Are you legally authorized to work in the United States?']?.shownValue === 'Yes', 'answers yes/no from the Answers tab');
  check(fields['Gender']?.shownValue === 'I do not wish to answer', 'declines EEO by default');
  check(fields['I agree to the terms and conditions']?.status === 'flag', 'flags the consent box');
  check(!(await page.locator('#agree').isChecked().catch(() => false)), 'never ticks the consent box');
  check((await page.locator('h2').innerText()) === 'Review', 'did not submit on its own');

  await ask('submitApplication');
  const after = await waitRun(['submitting', 'review']);
  check(after.status === 'done', `submits only when asked (status: ${after.status})`);
} finally {
  await ctx.close();
}
process.exit(failed ? 1 : 0);
