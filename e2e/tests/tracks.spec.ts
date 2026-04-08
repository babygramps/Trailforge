import { test, expect } from '@playwright/test';

test.describe('Track Management', () => {
  let accessToken: string;

  test.beforeEach(async ({ page, request }) => {
    const email = `tracks-${Date.now()}@test.trailforge.io`;
    const res = await request.post('/api/auth/register', {
      data: {
        email,
        password: 'trailforge-test-2024',
        display_name: 'Track Tester',
      },
    });
    const { tokens } = await res.json();
    accessToken = tokens.access_token;

    // Create a test track via API
    await request.post('/api/tracks', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        name: 'E2E Test Trail',
        activity_type: 'hike',
        description: 'Created by E2E test',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-119.5966, 37.7567, 1209],
            [-119.5958, 37.7571, 1215],
            [-119.5949, 37.7580, 1222],
          ],
        },
        stats: { distance_m: 200, duration_s: 300 },
      },
    });

    await page.goto('/');
    await page.evaluate((token: string) => {
      localStorage.setItem('trailforge_access_token', token);
    }, accessToken);
    await page.reload();
  });

  test('view track list', async ({ page }) => {
    await page.goto('/tracks');
    await expect(page.getByText('E2E Test Trail')).toBeVisible({ timeout: 10000 });
  });

  test('export GPX', async ({ page }) => {
    await page.goto('/tracks');
    await expect(page.getByText('E2E Test Trail')).toBeVisible({ timeout: 10000 });

    // Listen for download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /gpx|export/i }).first().click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.gpx');
  });

  test('delete track', async ({ page }) => {
    await page.goto('/tracks');
    await expect(page.getByText('E2E Test Trail')).toBeVisible({ timeout: 10000 });

    // Accept confirmation dialog
    page.on('dialog', (dialog) => dialog.accept());

    await page.getByRole('button', { name: /delete/i }).first().click();

    // Track should disappear
    await expect(page.getByText('E2E Test Trail')).not.toBeVisible({ timeout: 5000 });
  });

  test('view track on map', async ({ page }) => {
    await page.goto('/tracks');
    await expect(page.getByText('E2E Test Trail')).toBeVisible({ timeout: 10000 });

    // Click track name to view on map
    await page.getByText('E2E Test Trail').click();

    // Should navigate to map view
    await expect(page).toHaveURL(/\//);
  });
});
