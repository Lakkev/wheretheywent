import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the production build (astro preview). `npm run build` first (CI does).
 * Network to tiles.openfreemap.org is allowed but tests never depend on it (basemap is decorative).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4323',
    trace: 'retain-on-failure',
    viewport: { width: 1366, height: 860 },
  },
  webServer: {
    command: 'node scripts/dev/serve-dist.mjs 4323',
    url: 'http://localhost:4323/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
