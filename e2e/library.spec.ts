import { expect, test } from '@playwright/test';
import { createPiece, eventuallyInRemote, remoteLog } from './support/helpers.ts';

test('creating a piece with a PDF opens its score and commits both to GitHub', async ({ page }) => {
  const id = await createPiece(page, 'Lagrima', { tags: 'classical, learning' });
  expect(id).toBe('lagrima');
  await expect(page.getByTestId('piece-title')).toHaveText('Lagrima');
  await expect(page.locator('.page')).toHaveCount(3);
  await expect(page.locator('.page canvas').first()).toBeVisible();

  const json = await eventuallyInRemote('pieces/lagrima/piece.json');
  expect(JSON.parse(json)).toMatchObject({
    title: 'Lagrima',
    tags: ['classical', 'learning'],
    scores: [{ file: 'lagrima.pdf' }],
  });
  expect(await eventuallyInRemote('pieces/lagrima/scores/lagrima.pdf')).toMatch(/^%PDF-/);
  expect(remoteLog().join('\n')).toContain("Add piece 'Lagrima'");
});

test('search and tag filters narrow the library', async ({ page }) => {
  await createPiece(page, 'Malaguena', { tags: 'flamenco', pdf: false });
  await createPiece(page, 'Asturias', { tags: 'classical', pdf: false });
  await page.goto('/');
  await page.getByLabel('Search pieces').fill('malag');
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
  await expect(page.getByTestId('piece-card')).toContainText('Malaguena');
  await page.getByLabel('Search pieces').fill('');
  await page.getByRole('button', { name: 'flamenco' }).click();
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
});

test('a setlist collects pieces in order and is saved to GitHub', async ({ page }) => {
  await createPiece(page, 'Romanza', { pdf: false });
  await page.goto('/');
  page.once('dialog', (d) => void d.accept('Warm-ups'));
  await page.getByTestId('new-setlist').click();
  await expect(page.getByRole('heading', { name: 'Warm-ups' })).toBeVisible();

  await page.goto('/piece/romanza');
  await page.getByText('🏷 Tags & setlists').click();
  await page.getByRole('checkbox', { name: 'Warm-ups' }).check();

  await page.goto('/');
  await page.getByRole('button', { name: /Warm-ups/ }).click();
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
  const setlists = JSON.parse(
    await eventuallyInRemote('setlists.json', (t) => t.includes('romanza')),
  ) as {
    setlists: { name: string; pieceIds: string[] }[];
  };
  expect(setlists.setlists[0]).toMatchObject({ name: 'Warm-ups', pieceIds: ['romanza'] });
});
