import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defaultAnswersProfile } from '@/src/profile/answers';
import { emptyResumeProfile } from '@/src/profile/resume';
import {
  clearResumeProfile,
  loadAnswersProfile,
  loadResumeProfile,
  saveAnswersProfile,
  saveResumeProfile,
} from '@/src/profile/storage';

describe('profile storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('has no resume profile before one is saved', async () => {
    expect(await loadResumeProfile()).toBeNull();
  });

  it('saves, loads and clears a resume profile', async () => {
    const profile = emptyResumeProfile();
    profile.personal.firstName = 'Jane';
    profile.skills = ['CUDA', 'Python'];

    await saveResumeProfile(profile);
    expect(await loadResumeProfile()).toEqual(profile);

    await clearResumeProfile();
    expect(await loadResumeProfile()).toBeNull();
  });

  it('refuses to save an invalid resume profile', async () => {
    const bad = emptyResumeProfile();
    bad.meta.confidence = 7;
    await expect(saveResumeProfile(bad)).rejects.toThrow();
    expect(await loadResumeProfile()).toBeNull();
  });

  it('ignores corrupted saved data without logging its values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await fakeBrowser.storage.local.set({ resumeProfile: { personal: { email: 12345 } } });

    expect(await loadResumeProfile()).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('12345');
  });

  it('returns default answers before any are saved', async () => {
    expect(await loadAnswersProfile()).toEqual(defaultAnswersProfile());
  });

  it('saves and loads answers', async () => {
    const answers = defaultAnswersProfile();
    answers.workAuthorized = 'yes';
    answers.eeo.disability = 'no';

    await saveAnswersProfile(answers);
    expect(await loadAnswersProfile()).toEqual(answers);
  });
});
