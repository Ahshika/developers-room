import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build (`npm run build` first) served by `vite preview`, so the
 * real CSP, base path and code-splitting are exercised. The portfolio origin is stubbed per test
 * (tests/e2e/fixtures.ts) so no request reaches the live site.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: 'http://localhost:4173/developers-room/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/developers-room/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 14'] } },
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
