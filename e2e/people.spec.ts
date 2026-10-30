import { expect, test } from '@playwright/test';
import { createPiece, eventuallyInRemote } from './support/helpers.ts';

test('a second person signed in through the gate gets their own practice log, and the first keeps theirs', async ({
  page,
  browser,
}) => {
  const id = await createPiece(page, 'Shared Waltz', { pdf: false });
  await page.getByTestId('practice-start').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('practice-finish').click();
  await page.getByTestId('practice-save').click();
  await expect(page.getByText('1 sessions')).toBeVisible();
  const month = new Date().toISOString().slice(0, 7).replace('-', '/');
  const log = await eventuallyInRemote(`log/${month}.jsonl`, (t) => t.includes('"shared-waltz"'));
  expect(log).not.toContain('"who"');

  const hers = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-email': 'Partner.Name@example.com' },
  });
  const wife = await hers.newPage();
  await wife.goto(`/piece/${id}`);
  await expect(wife.getByText('0 sessions')).toBeVisible();
  await wife.goto('/log');
  await expect(wife.getByTestId('streak')).toHaveText('0');
  await expect(wife.locator('main')).not.toContainText('Shared Waltz');
  await wife.goto(`/piece/${id}`);
  await wife.getByTestId('practice-start').click();
  await wife.waitForTimeout(1200);
  await wife.getByTestId('practice-finish').click();
  await wife.getByTestId('practice-save').click();
  await expect(wife.getByText('1 sessions')).toBeVisible();
  await eventuallyInRemote(`log/${month}.jsonl`, (t) => t.includes('"who":"partner.name"'));

  await page.goto('/log');
  await expect(page.getByTestId('session-list')).toContainText('Shared Waltz');
  await page.goto(`/piece/${id}`);
  await expect(page.getByText('1 sessions')).toBeVisible();
  await hers.close();
});
