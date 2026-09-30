// Runs inside Workday job pages. Empty for now — the Scanner/Filler arrive in M2+.
export default defineContentScript({
  matches: ['*://*.myworkdayjobs.com/*'],
  main() {
    console.log('[FormPilot] content script loaded');
  },
});
