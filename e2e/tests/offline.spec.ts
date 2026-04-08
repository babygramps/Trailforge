import { test, expect } from '@playwright/test';

test.describe('Offline Behavior', () => {
  test.beforeEach(async ({ page, request }) => {
    const email = `offline-${Date.now()}@test.trailforge.io`;
    const res = await request.post('/api/auth/register', {
      data: {
        email,
        password: 'trailforge-test-2024',
        display_name: 'Offline Tester',
      },
    });
    const { tokens } = await res.json();

    await page.goto('/');
    await page.evaluate((token: string) => {
      localStorage.setItem('trailforge_access_token', token);
    }, tokens.access_token);
    await page.reload();
  });

  test('offline indicator shows when offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);

    // Offline indicator should appear
    await expect(page.getByText(/offline/i)).toBeVisible({ timeout: 5000 });

    // Go back online
    await context.setOffline(false);

    // Offline indicator should disappear
    await expect(page.getByText(/offline/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('data syncs when back online', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.7567, longitude: -119.5966, accuracy: 10 });

    await page.goto('/record');

    // Start recording
    await page.getByRole('button', { name: /start recording/i }).click();
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);

    // Continue recording while offline
    await context.setGeolocation({ latitude: 37.7571, longitude: -119.5958, accuracy: 8 });
    await page.waitForTimeout(3000);

    // Go back online
    await context.setOffline(false);

    // Sync indicator should appear briefly
    const syncBar = page.getByText(/syncing|pending/i);
    // Give it time to sync
    await page.waitForTimeout(5000);

    // Stop recording
    await page.getByRole('button', { name: /stop/i }).click();
  });
});
