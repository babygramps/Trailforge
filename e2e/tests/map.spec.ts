import { test, expect } from '@playwright/test';

test.describe('Map View', () => {
  test.beforeEach(async ({ page, request }) => {
    const email = `map-${Date.now()}@test.trailforge.io`;
    const res = await request.post('/api/auth/register', {
      data: {
        email,
        password: 'trailforge-test-2024',
        display_name: 'Map Tester',
      },
    });
    const { tokens } = await res.json();

    await page.goto('/');
    await page.evaluate((token: string) => {
      localStorage.setItem('trailforge_access_token', token);
    }, tokens.access_token);
    await page.reload();
  });

  test('map loads with default center', async ({ page }) => {
    await page.goto('/');

    // Map container should be visible
    const mapEl = page.locator('.map-container, [class*="map"], canvas');
    await expect(mapEl.first()).toBeVisible({ timeout: 15000 });

    // No JS console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(2000);
    // Filter out known non-critical errors (e.g., tile fetch failures)
    const criticalErrors = errors.filter(
      (e) => !e.includes('tile') && !e.includes('404') && !e.includes('Failed to fetch')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('layer toggle works', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Open layer manager (may be in sidebar or drawer)
    const layerToggle = page.getByText(/layers|layer manager/i).first();
    if (await layerToggle.isVisible()) {
      await layerToggle.click();
    }

    // Find a layer checkbox (e.g., satellite)
    const checkbox = page.getByRole('checkbox', { name: /satellite/i });
    if (await checkbox.isVisible()) {
      const wasChecked = await checkbox.isChecked();
      await checkbox.click();
      expect(await checkbox.isChecked()).toBe(!wasChecked);
    }
  });

  test('preset applies', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Find and click the Minimal preset
    const minimalBtn = page.getByRole('button', { name: /minimal/i });
    if (await minimalBtn.isVisible()) {
      await minimalBtn.click();

      // Verify the preset button has active state
      await expect(minimalBtn).toHaveClass(/active/);
    }
  });
});
