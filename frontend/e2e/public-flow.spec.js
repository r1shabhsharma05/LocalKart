import { test, expect } from '@playwright/test';

// Public smoke flow against the live site (no login needed, so no OTP):
// open -> listings appear (or the waking-up state first) -> search ->
// open a listing -> product page shows the seller/message action.
// The Render free backend can take ~50s to wake, so waits are generous.
test('public flow: listings load, search works, listing page opens', async ({ page }) => {
  await page.goto('/');

  // Listings appear (fast locally; up to ~50s on the live free backend).
  // The waking-up skeleton itself is covered by the HomePage unit test.
  await expect(page.locator('.product-card-rail').first()).toBeVisible({ timeout: 120000 });

  await page.getByLabel('Search items').fill('Java');
  await page.getByLabel('Search items').press('Enter');
  await expect(page.locator('.product-card-rail').first()).toBeVisible({ timeout: 30000 });

  const firstTitle = await page.locator('.product-card-rail h3').first().textContent();
  await page.locator('.product-card-rail h3').first().click();
  await expect(page.getByRole('heading', { name: firstTitle.trim() })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Message|Contact seller|seller/i).first()).toBeVisible();
});

// Small-viewport check: at 390px nothing overflows horizontally.
test('homepage has no horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.product-card-rail').first()).toBeVisible({ timeout: 120000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
