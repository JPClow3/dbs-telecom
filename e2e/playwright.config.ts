import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 850 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'node scripts/serve-current-mobile.mjs',
    cwd: path.resolve(__dirname),
    url: 'http://localhost:3000/api/health',
    // Reuse would bypass the fresh Expo export and can serve an old bundle.
    reuseExistingServer: false,
    // A clean Expo export can take more than a minute on Windows.
    timeout: 180000,
  },
});
