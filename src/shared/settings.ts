import { storage } from 'wxt/utils/storage';
import { DEFAULT_GEMINI_MODEL } from '@/src/ai/gemini';

// The Gemini API key, saved in chrome.storage.local (stays on this computer, not synced).
// Written by the options page. Only the background service worker should read it.
export const geminiApiKey = storage.defineItem<string>('local:geminiApiKey', {
  fallback: '',
});

// Which Gemini model to use. Defaults to Google's "newest Flash" alias; the user can pick
// another one from the live list in Settings.
export const geminiModel = storage.defineItem<string>('local:geminiModel', {
  fallback: DEFAULT_GEMINI_MODEL,
});
