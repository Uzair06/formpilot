import { handleBackgroundMessage } from '@/src/messaging/background-handler';

export default defineBackground(() => {
  // Open the side panel when the user clicks the FormPilot toolbar icon.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[FormPilot] could not set side panel behavior', error));

  // Answer messages from our own side panel / content script. `return true` tells Chrome
  // the answer will come later (after the AI call), so it keeps the reply channel open.
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    handleBackgroundMessage(message).then(sendResponse);
    return true;
  });
});
