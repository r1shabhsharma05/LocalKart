import { defineConfig } from 'vitest/config';

// Playwright specs live under e2e/ and are run with `npx playwright test`,
// not vitest: vitest picked them up and failed on Playwright's test(),
// which made `npm test` exit non-zero even with all 16 unit tests green.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
