import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:80',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    geolocation: { latitude: 37.7567, longitude: -119.5966 },
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
