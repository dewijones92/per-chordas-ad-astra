import { expect, test } from '@playwright/test';

test('health reports the build and a clean sync state', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ ok: true, version: 'e2e', sync: { lastError: null } });
});

test('unknown pages show the lost-in-space page rather than a blank screen', async ({ page }) => {
  await page.goto('/nowhere/at/all');
  await expect(page.getByRole('heading', { name: /Lost in space/ })).toBeVisible();
});
