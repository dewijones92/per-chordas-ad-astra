import { makeMscx, makeMusicXml, PIANO_WALTZ, zipScore } from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, openLibrary, remoteLog } from './support/helpers.ts';

const waltzMscz = () => ({
  name: 'Fixture Waltz.mscz',
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(zipScore('waltz.mscx', makeMscx(PIANO_WALTZ, '4.50'))),
});

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

const position = async (page: Page) =>
  Number(await page.getByTestId('playalong-canvas').getAttribute('data-position'));

async function dragBars(page: Page, from: number, to: number): Promise<void> {
  const strip = page.getByTestId('playalong-bars');
  const box = await strip.boundingBox();
  if (!box) throw new Error('no bar strip');
  const cell = Number(await strip.getAttribute('data-cell-width'));
  await page.mouse.move(box.x + cell * (from + 0.5), box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * (to + 0.5), box.y + 10, { steps: 5 });
  await page.mouse.up();
}

test('a MuseScore file plays as falling notes, transposes, loops, and remembers it all', async ({
  page,
}) => {
  const id = await createPiece(page, 'Waltz Practice', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-part')).toHaveText([/Piano RH/, /Piano LH/]);
  await expect(page.getByTestId('playalong-key')).toContainText('G major');

  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(0.5);
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await expect(page.getByTestId('playalong-capo')).toContainText('Capo 2');
  const json = await eventuallyInRemote(`pieces/${id}/piece.json`, (t) =>
    t.includes('"transpose": 2'),
  );
  expect(JSON.parse(json)).toMatchObject({ music: [{ file: 'fixture-waltz.mscz', transpose: 2 }] });
  expect(remoteLog().join('\n')).toContain(
    "Transpose fixture-waltz.mscz to +2 in 'Waltz Practice'",
  );

  await dragBars(page, 0, 1);
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–2');

  await page.getByRole('button', { name: 'Hide Piano RH' }).click();
  await page.getByRole('button', { name: 'Mute Piano LH' }).click();
  await page.getByLabel('Play-along speed').fill('60');
  await expect(page.getByTestId('playalong-speed')).toHaveText('60%');
  await page.getByTestId('playalong-names').check();

  await page.reload();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–2');
  await expect(page.getByTestId('playalong-speed')).toHaveText('60%');
  await expect(page.getByRole('button', { name: 'Show Piano RH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unmute Piano LH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mute Piano RH' })).toBeVisible();
  await expect(page.getByTestId('playalong-names')).toBeChecked();
});

test('speed up each loop plays the looped bar faster every time round', async ({ page }) => {
  await createPiece(page, 'Ramp Study', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await page.getByLabel('Play-along speed').fill('50');
  await page.getByRole('button', { name: 'From here' }).click();
  await page.getByRole('button', { name: 'To here' }).click();
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
  await page.getByTestId('playalong-ramp').check();
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-speed')).toHaveText('55%', { timeout: 10_000 });
  await expect(page.getByTestId('playalong-speed')).toHaveText('60%', { timeout: 10_000 });
  await page.getByTestId('playalong-play').click();
});

test('the score and the falling notes show side by side, or one at a time', async ({ page }) => {
  await createPiece(page, 'Split View Etude');
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await expect(page.locator('[data-piece-view="split"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-piece-view="score"]').click();
  await expect(page.getByTestId('playalong-canvas')).toHaveCount(0);
  await expect(page.locator('.page canvas').first()).toBeVisible();

  await page.locator('[data-piece-view="notes"]').click();
  await expect(page.locator('.page')).toHaveCount(0);
  await page.getByTestId('playalong-canvas').click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('k');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');

  await openLibrary(page);
  await page
    .getByTestId('piece-card')
    .filter({ hasText: 'Split View Etude' })
    .getByRole('link')
    .click();
  await expect(page.locator('[data-piece-view="notes"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a file that is not music says why', async ({ page }) => {
  await createPiece(page, 'Broken Music', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'broken.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<html><body>not a score</body></html>'),
  });
  await expect(page.getByTestId('playalong-error')).toContainText(
    'Not a MuseScore or MusicXML file',
  );
});
