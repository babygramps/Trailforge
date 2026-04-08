import { test, expect } from '@playwright/test';

const testUser = {
  email: `e2e-${Date.now()}@test.trailforge.io`,
  password: 'trailforge-test-2024',
  displayName: 'E2E Test Hiker',
};

test.describe('Authentication', () => {
  test('register new user', async ({ page }) => {
    await page.goto('/');

    // Navigate to registration (adjust selectors based on actual UI)
    const registerLink = page.getByRole('link', { name: /register|sign up/i });
    if (await registerLink.isVisible()) {
      await registerLink.click();
    }

    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).first().fill(testUser.password);
    await page.getByLabel(/display name|name/i).fill(testUser.displayName);
    await page.getByRole('button', { name: /register|sign up/i }).click();

    // Should redirect to map page after registration
    await expect(page).toHaveURL(/\//);
    await expect(page.locator('.map-container, [class*="map"]')).toBeVisible();
  });

  test('login with existing user', async ({ page, request }) => {
    // Register via API first
    await request.post('/api/auth/register', {
      data: {
        email: `login-${Date.now()}@test.trailforge.io`,
        password: testUser.password,
        display_name: testUser.displayName,
      },
    });

    await page.goto('/');

    await page.getByLabel(/email/i).fill(testUser.email);
    await page.getByLabel(/password/i).first().fill(testUser.password);
    await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();

    await expect(page.locator('.map-container, [class*="map"]')).toBeVisible();
  });

  test('reject invalid credentials', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel(/email/i).fill('nobody@test.trailforge.io');
    await page.getByLabel(/password/i).first().fill('wrong-password');
    await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();

    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible();
  });
});
