import { readFileSync } from 'node:fs';
import {
  GUITAR_STYLE_WALTZ,
  makeMscx,
  makeMusicXml,
  PIANO_WALTZ,
  zipScore,
} from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, openLibrary, remoteLog } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

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
  await expect(page.getByTestId('playalong-play-on').locator('[aria-pressed="true"]')).toHaveText(
    strings.playAlong.instruments.piano,
  );
  await expect(page.getByTestId('playalong-capo')).toHaveCount(0);
  await page
    .getByTestId('playalong-play-on')
    .getByRole('button', { name: strings.playAlong.instruments.guitar })
    .click();
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
  await expect(page.getByTestId('playalong-speed')).toHaveValue('60');
  await page.getByTestId('playalong-names').check();

  await page.reload();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await expect(page.getByTestId('playalong-capo')).toContainText('Capo 2');
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–2');
  await expect(page.getByTestId('playalong-speed')).toHaveValue('60');
  await expect(page.getByRole('button', { name: 'Show Piano RH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unmute Piano LH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mute Piano RH' })).toBeVisible();
  await expect(page.getByTestId('playalong-names')).toBeChecked();
});

test('a loop switched off plays straight through, keeps its bars, and comes back on when set', async ({
  page,
}) => {
  await createPiece(page, 'Loop Switch', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  const loopOn = page.getByTestId('playalong-loop-on');
  await expect(loopOn).toBeDisabled();
  await expect(loopOn).not.toBeChecked();
  await page.getByRole('button', { name: 'From here' }).click();
  await page.getByRole('button', { name: 'To here' }).click();
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
  await expect(loopOn).toBeChecked();
  await page.getByTestId('playalong-countin').uncheck();
  await page.getByTestId('playalong-play').click();
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(1);
  await page.waitForTimeout(1500);
  expect(await position(page)).toBeLessThan(1.55);

  await loopOn.uncheck();
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(1.7);
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
  await page.getByTestId('playalong-play').click();

  await page.reload();
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
  await expect(page.getByTestId('playalong-loop-on')).not.toBeChecked();
  await page.getByRole('button', { name: 'To here' }).click();
  await expect(page.getByTestId('playalong-loop-on')).toBeChecked();
});

test('speed goes down to 5% in half-percent steps, takes a typed speed, and speeds up by a chosen step to a chosen stop', async ({
  page,
}) => {
  await createPiece(page, 'Fine Speed', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  const speed = page.getByTestId('playalong-speed');
  await page.getByLabel('Play-along speed').fill('5');
  await expect(speed).toHaveValue('5');
  await expect(page.getByRole('button', { name: tips.playAlong.slower })).toBeDisabled();
  await page.getByRole('button', { name: tips.playAlong.faster }).click();
  await expect(speed).toHaveValue('5.5');
  await speed.fill('50');
  await speed.press('Enter');
  await expect(speed).toHaveValue('50');
  await speed.blur();
  await page.keyboard.press(']');
  await expect(speed).toHaveValue('50.5');
  await page.keyboard.press('[');
  await expect(speed).toHaveValue('50');

  await page.getByRole('button', { name: 'From here' }).click();
  await page.getByRole('button', { name: 'To here' }).click();
  await page.getByTestId('playalong-ramp').check();
  await page.getByTestId('playalong-ramp-step').fill('2.5');
  await page.getByTestId('playalong-ramp-step').press('Enter');
  await page.getByTestId('playalong-ramp-target').fill('55');
  await page.getByTestId('playalong-ramp-target').press('Enter');
  await page.getByTestId('playalong-countin').uncheck();
  await page.getByTestId('playalong-play').click();
  await expect(speed).toHaveValue('52.5', { timeout: 10_000 });
  await expect(speed).toHaveValue('55', { timeout: 10_000 });
  await page.waitForTimeout(4000);
  await expect(speed).toHaveValue('55');
  await page.getByTestId('playalong-play').click();

  await page.reload();
  await expect(page.getByTestId('playalong-ramp-step')).toHaveValue('2.5');
  await expect(page.getByTestId('playalong-ramp-target')).toHaveValue('55');
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
  await expect(page.getByTestId('playalong-speed')).toHaveValue('55', { timeout: 10_000 });
  await expect(page.getByTestId('playalong-speed')).toHaveValue('60', { timeout: 10_000 });
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

test('a new piece can start from a MuseScore file, named from it, and opens in Play-along', async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  const dialog = page.getByTestId('new-piece-dialog');
  await dialog.locator('input[name="music"]').setInputFiles(waltzMscz());
  await expect(dialog.locator('input[name="title"]')).toHaveValue('Fixture Waltz');
  await expect(dialog.locator('input[name="artist"]')).toHaveValue('Fixture Composer');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/piece\/fixture-waltz$/);
  await expect(page.getByTestId('piece-title')).toHaveText('Fixture Waltz');
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-key')).toContainText('G major');
  await eventuallyInRemote('pieces/fixture-waltz/piece.json', (t) =>
    t.includes('"file": "fixture-waltz.mscz"'),
  );

  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  await dialog.locator('input[name="title"]').fill('My Own Name');
  await dialog.locator('input[name="music"]').setInputFiles(waltzXml());
  await expect(dialog.locator('input[name="artist"]')).toHaveValue('Fixture Composer');
  await expect(dialog.locator('input[name="title"]')).toHaveValue('My Own Name');
});

test('hard bits that failed to load cannot be overwritten by saving a new one', async ({
  page,
}) => {
  const id = await createPiece(page, 'Hard Bit Guard', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'From here' }).click();
  await page.getByRole('button', { name: 'To here' }).click();
  page.once('dialog', (d) => void d.accept('Opening'));
  await page.getByTestId('save-hard-bit').click();
  await eventuallyInRemote(`pieces/${id}/hard-bits.json`, (t) => t.includes('Opening'));

  let failing = true;
  await page.route('**/api/pieces/*/hard-bits', (route) =>
    failing ? route.fulfill({ status: 502, body: 'bad gateway' }) : route.fallback(),
  );
  await page.reload();
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await dragBars(page, 1, 2);
  await expect(page.getByTestId('hard-bits-error')).toBeVisible();
  await expect(page.getByTestId('save-hard-bit')).toHaveCount(0);

  failing = false;
  await page
    .getByTestId('hard-bits-error')
    .getByRole('button', { name: strings.common.retry })
    .click();
  await expect(page.getByTestId('hard-bit')).toContainText('Opening');
  await expect(page.getByTestId('save-hard-bit')).toBeVisible();
});

test('the notation zooms with its buttons and Ctrl+wheel, and keeps the zoom after a reload', async ({
  page,
}) => {
  await createPiece(page, 'Zoom Etude', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  const notation = page.getByTestId('notation');
  await expect(notation).toHaveAttribute('data-scale', '38');
  const level = page.getByTestId('notation-zoom-level');
  await level.locator('..').getByRole('button', { name: 'Zoom in' }).click();
  await level.locator('..').getByRole('button', { name: 'Zoom in' }).click();
  await expect(level).toHaveText('120%');
  await expect(notation).toHaveAttribute('data-scale', '46');
  const box = await notation.boundingBox();
  if (!box) throw new Error('no notation box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(level).not.toHaveText('120%');
  const zoomed = await level.textContent();
  await page.reload();
  await expect(page.getByTestId('notation-zoom-level')).toHaveText(zoomed ?? '');
});

test('drawing on the notation is saved per bar, follows a transposition, and undoes on its own', async ({
  page,
}) => {
  const id = await createPiece(page, 'Notation Marks');
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.locator('[data-piece-view="split"]')).toHaveAttribute('aria-pressed', 'true');
  const pdfLayer = page.getByTestId('annotation-layer-1');
  await expect(pdfLayer).toBeVisible();
  await page.locator('.score-area [data-tool="stamp"]').click();
  await pdfLayer.click({ position: { x: 60, y: 60 } });
  await expect(pdfLayer).toHaveAttribute('data-items', '1');

  await page.getByTestId('notation-draw').click();
  await expect(page.getByTestId('zoom-level').last()).toHaveText('150%');
  const bar2 = page.getByTestId('notation-layer-2');
  await expect(bar2).toBeVisible();
  const b = await bar2.boundingBox();
  if (!b) throw new Error('no bar box');
  await page.keyboard.press('p');
  await page.mouse.move(b.x + 6, b.y + b.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 6, b.y + b.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await expect(bar2).toHaveAttribute('data-items', '1');
  const doc = JSON.parse(
    await eventuallyInRemote(`pieces/${id}/annotations/fixture-waltz.mscz.json`, (t) =>
      t.includes('"stroke"'),
    ),
  ) as { pages: Record<string, { kind: string }[]> };
  expect(Object.keys(doc.pages)).toEqual(['2']);
  expect(remoteLog('%s').join('\n')).toContain('fixture-waltz.mscz bar 2');

  await page.getByTestId('notation-draw-done').click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('A♭ major');
  const measure2 = page.getByTestId('notation-svg').locator('g.measure').nth(1);
  await expect(async () => {
    const m = await measure2.boundingBox();
    const l = await bar2.boundingBox();
    expect(Math.abs((m?.x ?? 0) - (l?.x ?? 99))).toBeLessThan(1.5);
  }).toPass();
  await page.reload();
  await expect(page.getByTestId('notation-layer-2')).toHaveAttribute('data-items', '1');
  await page.locator('.score-area [data-tool="stamp"]').click();
  await page.getByTestId('annotation-layer-1').click({ position: { x: 90, y: 90 } });
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '2');

  await page.getByTestId('notation-draw').click();
  await page.locator('.playalong [data-tool="stamp"]').click();
  await page.getByTestId('notation-layer-2').click({ position: { x: 20, y: 30 } });
  await expect(page.getByTestId('notation-layer-2')).toHaveAttribute('data-items', '2');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('notation-layer-2')).toHaveAttribute('data-items', '1');
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '2');
});

test('notation marks keep their text when clicked, and a mark on bar 1 stays on its note across a key change', async ({
  page,
}) => {
  const id = await createPiece(page, 'Bar One Marks', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await page.getByTestId('notation-draw').click();
  const bar1 = page.getByTestId('notation-layer-1');
  await expect(bar1).toBeVisible();
  const firstNote = page
    .getByTestId('notation-svg')
    .locator('g.measure')
    .first()
    .locator('g.note')
    .first();
  const noteX = async () => {
    const b = await firstNote.boundingBox();
    if (!b) throw new Error('no note');
    return b.x + b.width / 2;
  };
  const stampX = async () => {
    const b = await bar1.locator('text').first().boundingBox();
    if (!b) throw new Error('no stamp');
    return b.x + b.width / 2;
  };
  const before = await noteX();
  const layer = await bar1.boundingBox();
  if (!layer) throw new Error('no layer');
  await page.locator('.playalong [data-tool="stamp"]').click();
  await bar1.click({ position: { x: before - layer.x, y: layer.height * 0.3 } });
  await expect(bar1).toHaveAttribute('data-items', '1');
  const offset = (await stampX()) - before;

  await page.locator('.playalong [data-tool="text"]').click();
  const bar2 = page.getByTestId('notation-layer-2');
  const bar2Box = await bar2.boundingBox();
  if (!bar2Box) throw new Error('no bar 2');
  await bar2.click({ position: { x: 10, y: bar2Box.height * 0.8 } });
  const editor = page.getByTestId('text-editor');
  await editor.fill('hello');
  await editor.click({ position: { x: 5, y: 5 } });
  await expect(editor).toHaveValue('hello');
  await page.keyboard.press('Control+Enter');
  await eventuallyInRemote(`pieces/${id}/annotations/fixture-waltz.mscz.json`, (t) =>
    t.includes('hello'),
  );

  await page.getByTestId('notation-draw-done').click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('A♭ major');
  await expect(async () => {
    expect(Math.abs((await stampX()) - (await noteX()) - offset)).toBeLessThan(3);
  }).toPass();
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

test('half-beats adds a softer click between the beats at the same tempo, and is remembered', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const started: number[] = [];
    (window as unknown as { clickPitches: number[] }).clickPitches = started;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      started.push(Math.round(this.frequency.value));
      start.call(this, when);
    };
  });
  const pitches = () =>
    page.evaluate(() => (window as unknown as { clickPitches: number[] }).clickPitches.slice());
  await createPiece(page, 'Half Beat Waltz', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzMscz());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-half-beats')).toHaveCount(0);
  await page.getByTestId('playalong-countin').uncheck();
  await page.getByTestId('playalong-click').check();

  await page.getByTestId('playalong-play').click();
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(1.2);
  await page.getByTestId('playalong-play').click();
  const plain = await pitches();
  expect(plain.filter((p) => p === 1175).length).toBeGreaterThan(0);
  expect(plain.filter((p) => p === 784)).toHaveLength(0);

  await page.getByTestId('playalong-half-beats').check();
  await page.getByTestId('playalong-play').click();
  await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(2.7);
  await page.getByTestId('playalong-play').click();
  const halves = (await pitches()).slice(plain.length);
  const beats = halves.filter((p) => p === 1175 || p === 1760).length;
  const subs = halves.filter((p) => p === 784).length;
  expect(subs).toBeGreaterThan(0);
  expect(Math.abs(subs - beats)).toBeLessThanOrEqual(2);

  await page.reload();
  await expect(page.getByTestId('playalong-half-beats')).toBeChecked();
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
  await page
    .locator('.nav')
    .getByRole('link', { name: strings.common.practiceLog, exact: true })
    .click();
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

test('by hand splits a guitar-style score so the hands never cross, and lets one hand be hidden', async ({
  page,
}) => {
  const pressed = async () =>
    Object.fromEntries(
      ((await page.getByTestId('playalong-canvas').getAttribute('data-pressed')) ?? '')
        .split(' ')
        .filter(Boolean)
        .map((pair) => pair.split(':')),
    ) as Record<string, string>;
  const choice = page.getByTestId('playalong-by-hand');
  await createPiece(page, 'Hands Study', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'Guitar Style.mscz',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(zipScore('guitar.mscx', makeMscx(GUITAR_STYLE_WALTZ, '4.50'))),
  });
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(choice.locator('[aria-pressed="true"]')).toHaveText(strings.playAlong.byHand);
  await expect(page.getByTestId('playalong-part')).toHaveText([
    new RegExp(strings.playAlong.handNames.right),
    new RegExp(strings.playAlong.handNames.left),
  ]);
  const left = '#13b9a6';
  const right = '#6d3df2';
  await expect.poll(pressed).toEqual({ '48': left, '55': left, '67': right });

  await choice.getByRole('button', { name: strings.playAlong.byPart }).click();
  await expect(page.getByTestId('playalong-part')).toHaveCount(2);
  await expect
    .poll(async () => {
      const p = await pressed();
      return p['55'] === p['67'] && p['48'] !== p['55'];
    })
    .toBe(true);

  await choice.getByRole('button', { name: strings.playAlong.byHand }).click();
  await page.getByRole('button', { name: `Hide ${tips.playAlong.handNames.left}` }).click();
  await expect.poll(pressed).toEqual({ '67': right });

  await page.reload();
  await expect(choice.locator('[aria-pressed="true"]')).toHaveText(strings.playAlong.byHand);
  await expect(
    page.getByRole('button', { name: `Show ${tips.playAlong.handNames.left}` }),
  ).toBeVisible();
});
