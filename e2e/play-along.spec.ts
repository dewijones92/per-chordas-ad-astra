import { readFileSync } from 'node:fs';
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

test('speed up each loop plays the looped bar faster every time round, and a hard bit keeps its best', async ({
  page,
}) => {
  const id = await createPiece(page, 'Ramp Study', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await page.getByLabel('Play-along speed').fill('50');
  await page.getByRole('button', { name: 'From here' }).click();
  await page.getByRole('button', { name: 'To here' }).click();
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
  page.once('dialog', (d) => void d.accept('Opening'));
  await page.getByTestId('save-hard-bit').click();
  await expect(page.getByTestId('hard-bit')).toHaveCount(1);
  await expect(page.getByTestId('hard-bit')).toContainText('Opening');
  await page.getByTestId('playalong-ramp').check();
  await page.getByTestId('playalong-countin').uncheck();
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-speed')).toHaveText('55%', { timeout: 10_000 });
  await expect(page.getByTestId('playalong-speed')).toHaveText('60%', { timeout: 10_000 });
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('hard-bit-best')).toHaveText(/best 5[05]%/);
  const json = await eventuallyInRemote(`pieces/${id}/hard-bits.json`, (t) =>
    t.includes('"bestSpeed": 0.55'),
  );
  expect(JSON.parse(json)).toMatchObject({
    files: { 'fixture-waltz.mscz': [{ name: 'Opening', fromBar: 1, toBar: 1 }] },
  });
  expect(remoteLog('%B').join('\n')).toContain("Mark hard bit 'Opening' in 'Ramp Study'");

  await page.getByRole('button', { name: 'Clear the loop' }).click();
  await page.reload();
  await page.getByTestId('hard-bit').getByRole('button', { name: 'Opening', exact: true }).click();
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
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

test('the notation shows above the falling notes, follows playback and transposes', async ({
  page,
}) => {
  await createPiece(page, 'Notation Waltz', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  const svg = page.getByTestId('notation-svg');
  await expect(svg).toBeVisible({ timeout: 20_000 });
  await expect(svg.locator('g.measure')).toHaveCount(3);
  await expect(svg.locator('g.keySig g.keyAccid')).toHaveCount(2);

  await page.getByTestId('playalong-play').click();
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(0.3);
  await expect.poll(() => svg.locator('.pa-playing').count(), { timeout: 8000 }).toBeGreaterThan(0);
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');

  await svg.locator('g.measure').nth(2).locator('g.note').first().click();
  await expect.poll(() => position(page)).toBeCloseTo(4.5, 1);

  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await expect(svg.locator('g.keySig g.keyAccid')).toHaveCount(6, { timeout: 20_000 });

  await page.getByTestId('playalong-notation').uncheck();
  await expect(page.getByTestId('notation')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-notation')).not.toBeChecked();
  await expect(page.getByTestId('notation')).toHaveCount(0);
});

test('a count-in bar plays before the music starts, and the click is remembered', async ({
  page,
}) => {
  await createPiece(page, 'Count In Waltz', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-countin')).toBeChecked();
  await page.getByTestId('playalong-click').check();
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(900);
  expect(await position(page)).toBeLessThan(0.05);
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(0.3);
  await page.getByTestId('playalong-play').click();

  await page.getByTestId('playalong-countin').uncheck();
  await page.reload();
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-countin')).not.toBeChecked();
  await expect(page.getByTestId('playalong-click')).toBeChecked();
});

test('pausing while the piano is still loading stops it from starting', async ({ page }) => {
  await createPiece(page, 'Quick Pause', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await page.getByTestId('playalong-play').click();
  await page.getByTestId('playalong-play').click();
  await page.waitForTimeout(2500);
  expect(await position(page)).toBeLessThan(0.05);
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
});

test('a minute of play-along is logged to the practice log when you leave the piece', async ({
  page,
}) => {
  const past = new Date(Date.now() - 10 * 60_000);
  await page.clock.install({ time: past });
  const id = await createPiece(page, 'Logged Waltz', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.fastForward('01:05');
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.nav').getByRole('link', { name: 'Practice log', exact: true }).click();
  const month = past.toISOString().slice(0, 7).replace('-', '/');
  const log = await eventuallyInRemote(`log/${month}.jsonl`, (t) =>
    t.includes(`"pieceId":"${id}"`),
  );
  expect(log).toContain('Play-along: Fixture Waltz, up to 100% speed');
  await expect(page.getByTestId('session-list')).toContainText('Play-along: Fixture Waltz');
});

test('the piece exports as MusicXML and MIDI in the key it is transposed to', async ({ page }) => {
  await createPiece(page, 'Export Practice', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-key')).toContainText('G major');
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('A major');

  const exportButton = (name: string) =>
    page.getByTestId('playalong-export').getByRole('button', { name });
  const [xmlFile] = await Promise.all([
    page.waitForEvent('download'),
    exportButton('💾 MusicXML').click(),
  ]);
  expect(xmlFile.suggestedFilename()).toBe('Fixture Waltz (+2).musicxml');
  const xml = readFileSync(await xmlFile.path(), 'utf8');
  expect(xml).toMatch(/^<\?xml/);
  expect(xml).toContain('<fifths>3</fifths>');

  const [midiFile] = await Promise.all([
    page.waitForEvent('download'),
    exportButton('💾 MIDI').click(),
  ]);
  expect(midiFile.suggestedFilename()).toBe('Fixture Waltz (+2).mid');
  expect(
    readFileSync(await midiFile.path())
      .subarray(0, 4)
      .toString('latin1'),
  ).toBe('MThd');
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
