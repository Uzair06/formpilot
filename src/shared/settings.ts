import { storage } from 'wxt/utils/storage';

// The Gemini API key, saved in chrome.storage.local (stays on this computer, not synced).
// Written by the options page. Only the background service worker should read it.
export const geminiApiKey = storage.defineItem<string>('local:geminiApiKey', {
  fallback: '',
});
