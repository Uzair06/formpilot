import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // WxtVitest sets up WXT's auto-imports, the `@/` path alias, and a fake `browser` API for tests.
  plugins: [WxtVitest()],
  resolve: {
    alias: [
      // pdf.js's main build needs very new browser features Node lacks; tests use its Node-friendly legacy build.
      { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' },
    ],
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
