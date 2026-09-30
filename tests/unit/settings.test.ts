import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { geminiApiKey } from '@/src/shared/settings';

describe('geminiApiKey setting', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('is empty when nothing has been saved', async () => {
    expect(await geminiApiKey.getValue()).toBe('');
  });

  it('returns the key after it is saved', async () => {
    await geminiApiKey.setValue('test-key-123');
    expect(await geminiApiKey.getValue()).toBe('test-key-123');
  });
});
