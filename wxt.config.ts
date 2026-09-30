import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: 'Fills Workday job applications from your resume. Submits only after you confirm.',
    // storage: save settings and profiles on this computer.
    // sidePanel: our main UI lives in Chrome's side panel.
    permissions: ['storage', 'sidePanel'],
    // The background worker calls the Gemini API. Nothing else is contacted.
    host_permissions: ['https://generativelanguage.googleapis.com/*'],
    // An empty action gives us a toolbar icon; clicking it opens the side panel (see background.ts).
    action: { default_title: 'Open FormPilot' },
  },
});
