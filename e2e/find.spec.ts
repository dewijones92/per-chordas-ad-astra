import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { strings } from '../apps/web/src/strings.ts';
import { MUTOPIA_OP9_PATH } from './support/find-stub.ts';
import { eventuallyInRemote, openLibrary } from './support/helpers.ts';

const stubOrigin = () =>
  readFileSync(join(import.meta.dirname, '.tmp', 'run', 'find-stub-origin.txt'), 'utf8').trim();

async function stubCalls(): Promise<string[]> {
  const res = await fetch(`${stubOrigin()}/__calls`);
  return (await res.json()) as string[];
}

async function openFinder(page: Page): Promise<Locator> {
  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  const panel = page.getByTestId('find-panel');
  await panel.locator('summary').click();
  return panel;
}

async function search(page: Page, panel: Locator, query: string): Promise<void> {
  await panel.getByTestId('find-query').fill(query);
  await panel.getByTestId('find-search').click();
  await expect(panel.getByTestId('find-count')).toBeVisible();
}

test('finds the Op. 9 No. 1 nocturne, shows its File check, imports it and opens it in Play-along', async ({
  page,
}) => {
  const panel = await openFinder(page);
  await search(page, panel, 'chopin nocturne');
  await expect(panel.getByTestId('find-count')).toHaveText(strings.find.found(6));

  const row = panel.locator('[data-testid="find-result"][data-id="mutopia:582"]');
  await expect(row).toContainText('Nocturne No. 1 in B-flat minor');
  await expect(row).toContainText('F. F. Chopin · Piano · Op. 9, No. 1');
  await expect(row).toContainText(
    strings.find.licence('Creative Commons Attribution-ShareAlike 2.5'),
  );
  await expect(row).toContainText(strings.find.scoreFormat('PDF (A4)'));
  await expect(row).toContainText(strings.find.musicFormat('MIDI'));
  await expect(row.getByRole('link', { name: strings.find.sourcePage })).toHaveAttribute(
    'href',
    /piece-info\.cgi\?id=582$/,
  );

  await row.getByTestId('find-choose').click();
  const chosen = panel.getByTestId('find-chosen');
  await expect(chosen.getByTestId('find-checked')).toContainText(strings.find.checked);
  await expect(chosen.getByTestId('file-check')).toHaveAttribute('data-verdict', 'piano');
  await expect(chosen).toContainText(
    strings.find.willImport(
      `${strings.find.scoreFormat('PDF (A4)')} + ${strings.find.musicFormat('MIDI')}`,
    ),
  );

  await chosen.getByTestId('find-import').click();
  await expect(page).toHaveURL(/\/piece\//);
  const id = new URL(page.url()).pathname.split('/').pop() ?? '';
  await expect(page.getByTestId('piece-title')).toHaveText('Nocturne No. 1 in B-flat minor');
  await expect(page.getByTestId('piece-source')).toContainText(
    strings.find.fromSite('Mutopia Project'),
  );
  await expect(page.getByTestId('piece-source')).toContainText(
    strings.find.attribution('Creative Commons Attribution-ShareAlike 2.5'),
  );
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('file-check')).toHaveAttribute('data-verdict', 'piano');

  const json = await eventuallyInRemote(`pieces/${id}/piece.json`, (t) => t.includes('"licence"'));
  expect(JSON.parse(json)).toMatchObject({
    artist: 'F. F. Chopin',
    source: {
      name: 'Mutopia Project',
      licence: 'Creative Commons Attribution-ShareAlike 2.5',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
    },
  });
  await eventuallyInRemote(`pieces/${id}/music/nocturne-no-1-in-b-flat-minor.mid`);
  await eventuallyInRemote(`pieces/${id}/scores/nocturne-no-1-in-b-flat-minor.pdf`);

  const calls = await stubCalls();
  expect(calls.filter((c) => c === `${MUTOPIA_OP9_PATH}.mid`)).toHaveLength(1);
});

test('a PDF-only result says it has no File check or Play-along, and imports as a score with its licence', async ({
  page,
}) => {
  const panel = await openFinder(page);
  await search(page, panel, 'chopin nocturne');
  const row = panel.getByTestId('find-result').filter({ hasText: 'Nocturnes, Op.9' });
  await expect(row).toContainText('Wikimedia Commons');
  await expect(row).toContainText(strings.find.licence('Public domain'));
  await expect(row).toContainText('6 pages');
  await row.getByTestId('find-choose').click();
  const chosen = panel.getByTestId('find-chosen');
  await expect(chosen.getByTestId('find-no-music')).toContainText(strings.find.noMusic);
  await expect(chosen.getByTestId('find-checked')).toHaveCount(0);

  await chosen.getByTestId('find-import').click();
  await expect(page).toHaveURL(/\/piece\//);
  await expect(page.getByTestId('piece-title')).toHaveText('Nocturnes, Op.9');
  await expect(page.getByTestId('piece-source')).toContainText(
    strings.find.fromSite('Wikimedia Commons'),
  );
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await expect(page.getByTestId('playalong-canvas')).toHaveCount(0);
});

test('says plainly when nothing is found, and when one site is down while the other answers', async ({
  page,
}) => {
  const panel = await openFinder(page);
  await search(page, panel, 'zzzz nothing');
  await expect(panel.getByTestId('find-count')).toHaveText(strings.find.nothingFound);
  await expect(panel.getByTestId('find-result')).toHaveCount(0);

  await search(page, panel, 'broken chopin');
  await expect(panel.getByTestId('find-site-failed')).toHaveText(
    new RegExp(`^${strings.find.siteFailed('Mutopia Project', '\\S+ answered 500')}$`),
  );
  await expect(panel.getByTestId('find-count')).toHaveText(strings.find.found(3));
  await expect(panel.getByTestId('find-result')).toHaveCount(3);
});

test('the search box does not submit the New piece form, and Back returns to the results', async ({
  page,
}) => {
  const panel = await openFinder(page);
  await panel.getByTestId('find-query').fill('chopin nocturne');
  await panel.getByTestId('find-query').press('Enter');
  await expect(panel.getByTestId('find-count')).toHaveText(strings.find.found(6));
  await expect(page).not.toHaveURL(/\/piece\//);
  await panel.getByTestId('find-choose').first().click();
  await expect(panel.getByTestId('find-chosen')).toBeVisible();
  await panel.getByRole('button', { name: strings.find.chosen }).click();
  await expect(panel.getByTestId('find-result')).toHaveCount(6);
});

test('a found score honours Start in C major or A minor like the other ways of adding music', async ({
  page,
}) => {
  const panel = await openFinder(page);
  const dialog = page.getByTestId('new-piece-dialog');
  await dialog.getByTestId('learn-key').check();
  await search(page, panel, 'chopin nocturne');
  await panel
    .locator('[data-testid="find-result"][data-id="mutopia:582"]')
    .getByTestId('find-choose')
    .click();
  await panel.getByTestId('find-chosen').getByTestId('find-import').click();
  await expect(page).toHaveURL(/\/piece\//);
  const id = new URL(page.url()).pathname.split('/').pop() ?? '';
  await expect(page.getByTestId('playalong-key')).toContainText('C major');
  await eventuallyInRemote(`pieces/${id}/piece.json`, (t) => t.includes('"transpose": 5'));

  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  await dialog.getByTestId('learn-key').uncheck();
});
