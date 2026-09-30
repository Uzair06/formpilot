export default defineBackground(() => {
  // Open the side panel when the user clicks the FormPilot toolbar icon.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[FormPilot] could not set side panel behavior', error));
});
