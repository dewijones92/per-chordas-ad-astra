import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, openLibrary, remoteLog } from './support/helpers.ts';
import { strings } from '../apps/web/src/strings.ts';

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
  await openLibrary(page);
  await page.getByLabel('Search pieces').fill('malag');
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
  await expect(page.getByTestId('piece-card')).toContainText('Malaguena');
  await page.getByLabel('Search pieces').fill('');
  await page.getByRole('button', { name: 'flamenco' }).click();
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
});

test('a setlist collects pieces in order and is saved to GitHub', async ({ page }) => {
  await createPiece(page, 'Romanza', { pdf: false });
  await openLibrary(page);
  page.once('dialog', (d) => void d.accept('Warm-ups'));
  await page.getByTestId('new-setlist').click();
  await expect(page.getByRole('heading', { name: 'Warm-ups' })).toBeVisible();

  await page.goto('/piece/romanza');
  await page.getByText(strings.piece.sections.tags).click();
  await page.getByRole('checkbox', { name: 'Warm-ups' }).check();

  await openLibrary(page);
  await page.getByRole('button', { name: /Warm-ups/ }).click();
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
  const setlists = JSON.parse(
    await eventuallyInRemote('setlists.json', (t) => t.includes('romanza')),
  ) as {
    setlists: { name: string; pieceIds: string[] }[];
  };
  expect(setlists.setlists[0]).toMatchObject({ name: 'Warm-ups', pieceIds: ['romanza'] });
});

const cardTitles = (page: Page) => page.getByTestId('piece-card').locator('h3').allTextContents();

test('sorts are remembered, drawing counts as an edit, and pins stay on top', async ({ page }) => {
  await createPiece(page, 'Zebra Waltz', { tags: 'sortcheck', pdf: false });
  const apple = await createPiece(page, 'Apple Etude', { tags: 'sortcheck' });
  await createPiece(page, 'Mango Rag', { tags: 'sortcheck', pdf: false });
  await openLibrary(page);
  await page.getByRole('button', { name: 'sortcheck' }).click();
  await expect(page.getByTestId('piece-card')).toHaveCount(3);
  expect(await cardTitles(page)).toEqual(['Apple Etude', 'Mango Rag', 'Zebra Waltz']);

  const sort = page.getByLabel('Sort pieces');
  await sort.selectOption({ label: strings.library.sorts.added });
  await expect.poll(() => cardTitles(page)).toEqual(['Mango Rag', 'Apple Etude', 'Zebra Waltz']);
  await expect(page.getByTestId('piece-when').first()).toHaveText(/^Added (just now|\d+ min ago)$/);
  await page.getByRole('button', { name: 'Reverse order' }).click();
  await expect.poll(() => cardTitles(page)).toEqual(['Zebra Waltz', 'Apple Etude', 'Mango Rag']);

  await page.reload();
  await openLibrary(page);
  await page.getByRole('button', { name: 'sortcheck' }).click();
  await expect(sort).toHaveValue('added');
  await expect(page.getByRole('button', { name: 'Reverse order' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => cardTitles(page)).toEqual(['Zebra Waltz', 'Apple Etude', 'Mango Rag']);

  const res = await page.request.put(`/api/pieces/${apple}/annotations/apple-etude.pdf`, {
    data: {
      version: 1,
      pages: {
        '1': [{ kind: 'stamp', id: 's1', colour: '#ff0000', glyph: '1', x: 50, y: 50, size: 18 }],
      },
    },
  });
  expect(res.ok()).toBe(true);
  await openLibrary(page);
  await page.getByRole('button', { name: 'sortcheck' }).click();
  await sort.selectOption({ label: strings.library.sorts.edited });
  await expect.poll(() => cardTitles(page)).toEqual(['Apple Etude', 'Mango Rag', 'Zebra Waltz']);

  await sort.selectOption({ label: strings.library.sorts.title });
  await page.getByRole('button', { name: 'Pin Zebra Waltz' }).click();
  await expect.poll(() => cardTitles(page)).toEqual(['Zebra Waltz', 'Apple Etude', 'Mango Rag']);
  await expect(page.getByRole('button', { name: 'Unpin Zebra Waltz' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const json = await eventuallyInRemote('pieces/zebra-waltz/piece.json', (t) =>
    t.includes('"pinned": true'),
  );
  expect(JSON.parse(json)).toMatchObject({ pinned: true });
  expect(remoteLog().join('\n')).toContain("Pin 'Zebra Waltz'");

  await page.reload();
  await openLibrary(page);
  await page.getByRole('button', { name: 'sortcheck' }).click();
  await expect.poll(() => cardTitles(page)).toEqual(['Zebra Waltz', 'Apple Etude', 'Mango Rag']);
});

test('the Continue row and Recently opened follow the pieces you open', async ({ page }) => {
  await createPiece(page, 'Opened First', { tags: 'opencheck', pdf: false });
  await createPiece(page, 'Opened Second', { tags: 'opencheck', pdf: false });
  await openLibrary(page);
  const continueRow = page.getByRole('region', { name: 'Continue where you left off' });
  await expect(continueRow.getByTestId('continue-item').first()).toContainText('Opened Second');

  await page
    .getByTestId('piece-card')
    .filter({ hasText: 'Opened First' })
    .getByRole('link')
    .click();
  await expect(page.getByTestId('piece-title')).toHaveText('Opened First');
  await page.locator('.nav').getByRole('link', { name: strings.nav.library, exact: true }).click();
  await expect(continueRow.getByTestId('continue-item').first()).toContainText('Opened First');
  await expect(continueRow.getByTestId('continue-item').first()).toContainText('just now');

  await page.getByRole('button', { name: 'opencheck' }).click();
  await expect(continueRow).toHaveCount(0);
  await page.getByLabel('Sort pieces').selectOption({ label: strings.library.sorts.opened });
  await expect.poll(() => cardTitles(page)).toEqual(['Opened First', 'Opened Second']);
});

test('practice badges, Needs practice, and Pick for me favour neglected pieces', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const old = await createPiece(page, 'Old Tango', { tags: 'practicecheck', pdf: false });
  const fresh = await createPiece(page, 'Fresh Jig', { tags: 'practicecheck', pdf: false });
  await createPiece(page, 'Never Reel', { tags: 'practicecheck', pdf: false });
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
  for (const [pieceId, startedAt] of [
    [old, daysAgo(30)],
    [fresh, daysAgo(0)],
  ] as const) {
    const res = await page.request.post('/api/sessions', {
      data: { pieceId, startedAt, durationSec: 600, bpm: null, note: '' },
    });
    expect(res.status()).toBe(201);
  }

  await openLibrary(page);
  await page.getByRole('button', { name: 'practicecheck' }).click();
  await page.getByLabel('Sort pieces').selectOption({ label: strings.library.sorts.neglected });
  await expect.poll(() => cardTitles(page)).toEqual(['Never Reel', 'Old Tango', 'Fresh Jig']);
  const practice = page.getByTestId('piece-practice');
  await expect(practice.nth(0)).toHaveText(strings.library.notPractised);
  await expect(practice.nth(1)).toHaveText('🕘 Practised 4 weeks ago · ⏱ 10 min');
  await expect(practice.nth(2)).toContainText('· ⏱ 10 min');

  await page.getByTestId('pick-for-me').click();
  await expect(page).toHaveURL(/\/piece\/never-reel$/);
});

test('searching ranks by best match and pauses the sort', async ({ page }) => {
  await createPiece(page, 'Searchable Sonata', { pdf: false });
  await openLibrary(page);
  await page.getByLabel('Search pieces').fill('searchable');
  await expect(page.getByLabel('Sort pieces')).toBeDisabled();
  await expect(page.getByText('Best match first while searching')).toBeVisible();
  await expect(page.getByTestId('piece-card')).toHaveCount(1);
});
