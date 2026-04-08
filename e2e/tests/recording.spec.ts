import { test, expect } from '@playwright/test';

test.describe('GPS Recording', () => {
  test.beforeEach(async ({ page, request }) => {
    // Register and login via API
    const email = `record-${Date.now()}@test.trailforge.io`;
    const res = await request.post('/api/auth/register', {
      data: {
        email,
        password: 'trailforge-test-2024',
        display_name: 'Recording Tester',
      },
    });
    const { tokens } = await res.json();

    // Store auth token in localStorage/cookie before navigating
    await page.goto('/');
    await page.evaluate((token: string) => {
      localStorage.setItem('trailforge_access_token', token);
    }, tokens.access_token);
    await page.reload();
  });

  test('record and save track', async ({ page, context }) => {
    // Grant geolocation permission (already in config)
    await context.grantPermissions(['geolocation']);

    // Simulate GPS positions along Yosemite trail
    await context.setGeolocation({ latitude: 37.7567, longitude: -119.5966, accuracy: 10 });

    await page.goto('/record');

    // Start recording
    const startBtn = page.getByRole('button', { name: /start recording/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Simulate movement
    await context.setGeolocation({ latitude: 37.7571, longitude: -119.5958, accuracy: 8 });
    await page.waitForTimeout(2000);

    await context.setGeolocation({ latitude: 37.7580, longitude: -119.5949, accuracy: 5 });
    await page.waitForTimeout(2000);

    // Stop recording
    const stopBtn = page.getByRole('button', { name: /stop/i });
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();

    // Verify track was saved — navigate to tracks page
    await page.goto('/tracks');
    await expect(page.getByText(/recording/i)).toBeVisible({ timeout: 10000 });
  });

  test('pause and resume recording', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.7567, longitude: -119.5966, accuracy: 10 });

    await page.goto('/record');

    // Start
    await page.getByRole('button', { name: /start recording/i }).click();
    await page.waitForTimeout(1000);

    // Pause
    const pauseBtn = page.getByRole('button', { name: /pause/i });
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();

    // Verify paused state
    await expect(page.getByText(/paused/i)).toBeVisible();

    // Resume
    const resumeBtn = page.getByRole('button', { name: /resume/i });
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();

    // Verify recording resumed
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();

    // Stop
    await page.getByRole('button', { name: /stop/i }).click();
  });
});
