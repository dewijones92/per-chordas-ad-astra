import {
  GUITAR_STYLE_WALTZ,
  makeMscx,
  makeMusicXml,
  PIANO_WALTZ,
  zipScore,
} from '../packages/fixtures/src/index.ts';
import { Fingering } from '../packages/shared/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, remoteFile, remoteLog } from './support/helpers.ts';
import { strings, tips, units } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

async function settledBox(page: Page) {
  const canvas = page.getByTestId('playalong-canvas');
  if ((await page.getByTestId('notation-frame').count()) > 0)
    await expect(page.locator('[data-testid="notation-frame"] svg').first()).toBeVisible();
  let last = JSON.stringify(await canvas.boundingBox());
  await expect
    .poll(async () => {
      await page.waitForTimeout(300);
      const now = JSON.stringify(await canvas.boundingBox());
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  return canvas.boundingBox();
}

async function clickNote(page: Page, pitch: number): Promise<void> {
  await settledBox(page);
  const canvas = page.getByTestId('playalong-canvas');
  const blocks = (await canvas.getAttribute('data-blocks')) ?? '';
  const hit = blocks
    .split(' ')
    .map((b) => b.split(':').map(Number))
    .find(([p]) => p === pitch);
  if (!hit) throw new Error(`no block for ${String(pitch)} in "${blocks}"`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + (hit[1] ?? 0), box.y + (hit[2] ?? 0));
}

test('click a falling note and press a number to finger it; the finger is saved, shared and cleared', async ({
  page,
}) => {
  await createPiece(page, 'Fingering Etude', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await expect(page.getByTestId('notation-svg').locator('g.measure')).toHaveCount(3, {
    timeout: 20_000,
  });
  await page.getByTestId('playalong-compact').click();
  await expect(canvas).toBeInViewport();
  await expect(canvas).toHaveAttribute('data-fingers', '0');

  const before = await settledBox(page);
  await clickNote(page, 71);
  const label = units.noteInBar('B4', 1);
  await expect(page.getByTestId('finger-picked')).toBeVisible();
  expect(await canvas.boundingBox()).toEqual(before);
  await expect(page.getByTestId('finger-picked')).toHaveText(strings.playAlong.fingerFor(label));
  await expect(canvas).toHaveAttribute('data-selected', /^[1-9]/);
  await page.keyboard.press('3');
  await expect(canvas).toHaveAttribute('data-fingers', /^[1-9]/);
  const saved = await eventuallyInRemote('pieces/fingering-etude/fingering.json', (t) =>
    t.includes('"3"'),
  );
  expect(
    Object.values(Fingering.parse(JSON.parse(saved)).files['fixture-waltz.musicxml'] ?? {}),
  ).toEqual(['3']);
  expect(remoteLog('%B').join('\n')).toContain(`Finger 3 on ${label} of 'Fingering Etude'`);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('finger-picked')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-selected', '0');

  await page.reload();
  await expect(canvas).toHaveAttribute('data-fingers', /^[1-9]/);

  await page.keyboard.press('Space');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: tips.playAlong.toStart }).click();
  await expect(canvas).toHaveAttribute('data-position', '0.000');

  await clickNote(page, 71);
  await page.keyboard.press('Backspace');
  await expect(canvas).toHaveAttribute('data-fingers', '0');
  await eventuallyInRemote('pieces/fingering-etude/fingering.json', (t) => !t.includes('"3"'));
});

test('a finger that could not be saved goes back to the last saved one, even when the reload fails too', async ({
  page,
}) => {
  await createPiece(page, 'Fingering Fails', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await page.getByTestId('playalong-compact').click();
  await expect(canvas).toHaveAttribute('data-fingers', '0');
  await expect(async () => {
    await clickNote(page, 71);
    await expect(page.getByTestId('finger-picked')).toBeVisible({ timeout: 1500 });
  }).toPass();

  await page.route('**/api/pieces/*/fingering**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"disk"}',
    });
  });
  const saveRefused = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes('/fingering/'),
  );
  const reloadRefused = page.waitForResponse(
    (r) => r.request().method() === 'GET' && r.url().endsWith('/fingering'),
  );
  await page.keyboard.press('3');
  expect((await saveRefused).status()).toBe(500);
  expect((await reloadRefused).status()).toBe(500);
  await expect(canvas).toHaveAttribute('data-fingers', '0');
  expect(remoteFile('pieces/fingering-fails/fingering.json')).toBeNull();
});

test('suggested fingering shows in grey by default, can be switched off, and is remembered', async ({
  page,
}) => {
  await createPiece(page, 'Suggested Etude', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  const box = page.getByTestId('playalong-suggest');
  await expect(box).toBeChecked();
  await expect(page.locator('label', { has: box })).toHaveAttribute(
    'title',
    tips.playAlong.suggest,
  );
  await expect(canvas).toHaveAttribute('data-suggested', /^[1-9]/);
  await expect(canvas).toHaveAttribute('data-fingers', '0');

  await box.uncheck();
  await expect(canvas).toHaveAttribute('data-suggested', '0');
  await page.reload();
  await expect(page.getByTestId('playalong-suggest')).not.toBeChecked();
  await expect(canvas).toHaveAttribute('data-suggested', '0');
});

const NOTE_B4 = units.noteInBar('B4', 1);

test('click a note on the stave and press a number: it shows in red on the stave and the falling notes, survives a reload and a transposition, and clears', async ({
  page,
}) => {
  await createPiece(page, 'Stave Etude', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  const svg = page.getByTestId('notation-svg');
  await expect(svg.locator('g.measure')).toHaveCount(3, { timeout: 20_000 });
  await expect(svg.locator('g.fing')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-fingers', '0');

  await svg.locator('g.measure').first().locator('g.note g.notehead').first().click();
  await expect(page.getByTestId('finger-picked')).toHaveText(strings.playAlong.fingerFor(NOTE_B4));
  await expect(svg.locator('g.note.pa-picked')).toHaveCount(1);
  await expect(canvas).toHaveAttribute('data-selected', /^[1-9]/);

  await page.keyboard.press('4');
  await expect(svg.locator('g.fing')).toHaveCount(1);
  await expect(svg.locator('g.fing')).toHaveText('4');
  await expect(svg.locator('g.fing text').first()).toHaveCSS('fill', 'rgb(215, 38, 61)');
  await expect(canvas).toHaveAttribute('data-fingers', /^[1-9]/);
  const saved = await eventuallyInRemote('pieces/stave-etude/fingering.json', (t) =>
    t.includes('"4"'),
  );
  expect(
    Object.values(Fingering.parse(JSON.parse(saved)).files['fixture-waltz.musicxml'] ?? {}),
  ).toEqual(['4']);
  expect(remoteLog('%B').join('\n')).toContain(`Finger 4 on ${NOTE_B4} of 'Stave Etude'`);

  await page.reload();
  await expect(svg.locator('g.fing')).toHaveText('4', { timeout: 20_000 });
  await expect(canvas).toHaveAttribute('data-fingers', /^[1-9]/);

  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await expect(svg.locator('g.keySig g.keyAccid')).toHaveCount(6, { timeout: 20_000 });
  await expect(svg.locator('g.fing')).toHaveText('4');

  await svg.locator('g.measure').first().locator('g.note g.notehead').first().click();
  await expect(svg.locator('g.note.pa-picked')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(svg.locator('g.fing')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-fingers', '0');
  await eventuallyInRemote('pieces/stave-etude/fingering.json', (t) => !t.includes('"4"'));
});

test('your finger replaces the one a MuseScore file prints, and clicking a bar still seeks and lets go of the note', async ({
  page,
}) => {
  await createPiece(page, 'Stave Replace', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'Fixture Waltz.mscz',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(zipScore('waltz.mscx', makeMscx(PIANO_WALTZ, '4.50'))),
  });
  const svg = page.getByTestId('notation-svg');
  const canvas = page.getByTestId('playalong-canvas');
  await expect(svg.locator('g.measure')).toHaveCount(3, { timeout: 20_000 });

  await svg.locator('g.measure').first().locator('g.note g.notehead').first().click();
  await page.keyboard.press('2');
  await expect(svg.locator('g.fing')).toHaveText('2');
  await page.keyboard.press('5');
  await expect(svg.locator('g.fing')).toHaveText('5');
  await expect(svg.locator('g.fing')).toHaveCount(1);

  const line = await svg
    .locator('g.measure')
    .nth(1)
    .locator('g.staff > path')
    .first()
    .boundingBox();
  if (!line) throw new Error('no staff line in bar 2');
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2);
  await expect(page.getByTestId('finger-picked')).toHaveCount(0);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-position')))
    .toBeCloseTo(1.5, 1);
  await expect(svg.locator('g.note.pa-picked')).toHaveCount(0);
  await expect(svg.locator('g.fing')).toHaveText('5');
});

test('a note redrawn in the other hand by the grand staff takes your finger on the stave', async ({
  page,
}) => {
  await createPiece(page, 'Stave Hands', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'Guitar Style.mscz',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(zipScore('gs.mscx', makeMscx(GUITAR_STYLE_WALTZ, '4.50'))),
  });
  const svg = page.getByTestId('notation-svg');
  await expect(svg.locator('g.staff')).toHaveCount(2, { timeout: 20_000 });
  const bass = svg
    .locator('g.measure')
    .first()
    .locator('g.staff')
    .nth(1)
    .locator('g.note g.notehead')
    .first();
  await bass.click();
  await expect(svg.locator('g.note.pa-picked')).toHaveCount(1);
  await page.keyboard.press('5');
  await expect(svg.locator('g.fing')).toHaveText('5');
  await eventuallyInRemote('pieces/stave-hands/fingering.json', (t) => t.includes('"5"'));
});

test('the middle of a hollow note head, which draws nothing, still picks the note', async ({
  page,
}) => {
  await createPiece(page, 'Stave Hollow', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const svg = page.getByTestId('notation-svg');
  await expect(svg.locator('g.measure')).toHaveCount(3, { timeout: 20_000 });
  const half = await svg
    .locator('g.measure')
    .first()
    .locator('g.note g.notehead')
    .nth(1)
    .boundingBox();
  if (!half) throw new Error('no half note head');
  await page.mouse.click(half.x + half.width / 2, half.y + half.height / 2);
  await expect(page.getByTestId('finger-picked')).toHaveText(
    strings.playAlong.fingerFor(units.noteInBar('G4', 1)),
  );
  await page.keyboard.press('3');
  await expect(svg.locator('g.fing')).toHaveText('3');
});
