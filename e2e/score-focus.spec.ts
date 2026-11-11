import { expect, test } from '@playwright/test';
import { strings } from '../apps/web/src/strings.ts';
import { createPiece, switchSaved } from './support/helpers.ts';

test('in the Score view, Fewer controls hides the top menu and title bar, and is remembered', async ({
  page,
}) => {
  await createPiece(page, 'Focus Study');
  await expect(page.locator('.page').first()).toBeVisible();
  const before = await page.locator('.page').first().boundingBox();
  const button = page.getByTestId('score-compact');
  await expect(button).toHaveText(strings.playAlong.fewerControls);
  await button.click();
  await expect(button).toHaveText(strings.playAlong.moreControls);
  await switchSaved(page, 'scoreFocus', true);
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.getByTestId('piece-title')).toBeHidden();
  const head = page.getByTestId('dock-head');
  await expect(head.getByRole('link', { name: strings.piece.library })).toBeVisible();
  await expect(head.getByTestId('sync-pill-docked')).toBeVisible();
  await expect
    .poll(async () => (await page.locator('.score-area').boundingBox())?.y)
    .toBeLessThan(10);
  await expect
    .poll(async () => (await page.locator('.page').first().boundingBox())?.height)
    .toBeGreaterThan((before?.height ?? 0) + 50);

  await page.reload();
  await expect(page.getByTestId('score-compact')).toHaveText(strings.playAlong.moreControls);
  await expect(page.locator('.topbar')).toBeHidden();
  await page.getByTestId('score-compact').click();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.getByTestId('piece-title')).toBeVisible();
  await expect(page.getByTestId('dock-head')).toHaveCount(0);
  await switchSaved(page, 'scoreFocus', false);
});
