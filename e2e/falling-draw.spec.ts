import { makeMidi, makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { Annotations } from '../packages/shared/src/index.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, remoteFile, remoteLog } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

async function blockCentre(page: Page, pitch: number): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('playalong-canvas');
  const blocks = (await canvas.getAttribute('data-blocks')) ?? '';
  const hit = blocks
    .split(' ')
    .map((b) => b.split(':').map(Number))
    .find(([p]) => p === pitch);
  if (!hit) throw new Error(`no block for ${String(pitch)} in "${blocks}"`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + (hit[1] ?? 0), y: box.y + (hit[2] ?? 0) };
}

async function settle(page: Page): Promise<void> {
  const canvas = page.getByTestId('playalong-canvas');
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
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('nothing to measure');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function musicalTime(page: Page, mark: Locator): Promise<number> {
  const marks = page.getByTestId('falling-marks');
  const box = await marks.boundingBox();
  if (!box) throw new Error('no marks box');
  const position = Number(await marks.getAttribute('data-position'));
  const pps = Number(await marks.getAttribute('data-pps'));
  const at = await centre(mark);
  return position + (box.height - (at.y - box.y)) / pps;
}

const fallingFile = 'pieces/falling-marks/annotations/fixture-waltz.musicxml.falling.json';

test('drawing on the falling notes is saved by bar, falls with the music, stays on its notes, and undoes on its own', async ({
  page,
}) => {
  await createPiece(page, 'Falling Marks', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  const marks = page.getByTestId('falling-marks');
  await expect(marks).toHaveAttribute('data-items', '0');
  await expect(marks).not.toHaveClass(/is-editable/);

  await page.getByTestId('notation-draw').click();
  await expect(marks).toHaveClass(/is-editable/);
  await settle(page);

  const note = await blockCentre(page, 71);
  await page.locator('.playalong [data-tool="stamp"]').click();
  await page.mouse.click(note.x, note.y);
  await expect(marks).toHaveAttribute('data-items', '1');
  const stamps = marks.locator('text', { hasText: /^1$/ });
  await expect(stamps).toHaveCount(2);
  await expect(marks).toHaveAttribute('data-shown', '2');
  const stamp = stamps.first();
  const saved = await eventuallyInRemote(fallingFile, (t) => t.includes('"stamp"'));
  const doc = Annotations.parse(JSON.parse(saved));
  const [bar] = Object.keys(doc.pages);
  expect(Object.keys(doc.pages)).toHaveLength(1);
  const item = doc.pages[bar ?? '']?.[0];
  if (item?.kind !== 'stamp') throw new Error('not a stamp');
  expect(item.x).toBeGreaterThan(70.6);
  expect(item.x).toBeLessThan(71.4);
  expect(remoteLog('%s').join('\n')).toContain(
    `Draw on the falling notes in 'Falling Marks' (fixture-waltz.musicxml bar ${bar ?? ''})`,
  );
  expect(remoteFile('pieces/falling-marks/annotations/fixture-waltz.musicxml.json')).toBeNull();

  await page.keyboard.press('p');
  await page.mouse.move(note.x - 40, note.y - 30);
  await page.mouse.down();
  await page.mouse.move(note.x + 40, note.y - 28, { steps: 8 });
  await page.mouse.up();
  await expect(marks).toHaveAttribute('data-items', '2');

  await page.locator('.playalong [data-tool="text"]').click();
  await page.mouse.click(note.x + 60, note.y - 90);
  const editor = page.getByTestId('text-editor');
  await editor.fill('hello');
  await page.keyboard.press('Control+Enter');
  await expect(marks).toHaveAttribute('data-items', '3');
  await eventuallyInRemote(fallingFile, (t) => t.includes('hello') && t.includes('"stroke"'));

  const before = await centre(stamp);
  const time = await musicalTime(page, stamp);
  await page.mouse.move(note.x, note.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => Math.round((await centre(stamp)).y - before.y)).toBeGreaterThan(80);
  expect(Math.abs((await musicalTime(page, stamp)) - time)).toBeLessThan(0.03);

  await page.mouse.wheel(0, 100);
  await expect.poll(async () => Math.abs((await centre(stamp)).y - before.y)).toBeLessThan(3);

  const lookAhead = await canvas.getAttribute('data-look-ahead');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Control');
  await expect(canvas).not.toHaveAttribute('data-look-ahead', lookAhead ?? '');
  await settle(page);
  expect(Math.abs((await musicalTime(page, stamp)) - time)).toBeLessThan(0.05);
  const afterZoom = await blockCentre(page, 71);
  expect(Math.abs((await centre(stamp)).x - afterZoom.x)).toBeLessThan(3);

  await page.getByTestId('notation-draw-done').click();
  await expect(marks).not.toHaveClass(/is-editable/);
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('A major');
  await settle(page);
  const transposed = await blockCentre(page, 71);
  expect(transposed.x).toBeGreaterThan(afterZoom.x);
  expect(Math.abs((await centre(stamp)).x - transposed.x)).toBeLessThan(3);
  expect(Math.abs((await musicalTime(page, stamp)) - time)).toBeLessThan(0.05);

  await page.reload();
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '3');
  await expect(page.getByTestId('falling-marks').locator('text', { hasText: /^1$/ })).toHaveCount(
    2,
  );
  await settle(page);

  await page.getByTestId('playalong-compact').click();
  await settle(page);
  await expect(async () => {
    const at = await blockCentre(page, 71);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('finger-picked')).toBeVisible({ timeout: 1500 });
  }).toPass();
  const picked = await blockCentre(page, 71);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '3');

  await page.getByTestId('playalong-compact').click();
  await page.getByTestId('notation-draw').click();
  await settle(page);
  await page.locator('.playalong [data-tool="stamp"]').click();
  await page.mouse.click(picked.x - 30, picked.y);
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '4');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '3');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '3');
  await eventuallyInRemote(fallingFile, (t) => t.includes('hello'));
});

test('a click on the falling notes outside Draw mode still picks a note, and Draw mode draws instead', async ({
  page,
}) => {
  await createPiece(page, 'Falling Picks', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await settle(page);
  const note = await blockCentre(page, 71);
  await page.mouse.click(note.x, note.y);
  await expect(page.getByTestId('finger-picked')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('finger-picked')).toHaveCount(0);

  await page.getByTestId('notation-draw').click();
  await settle(page);
  const again = await blockCentre(page, 71);
  await page.locator('.playalong [data-tool="stamp"]').click();
  await page.mouse.click(again.x, again.y);
  await expect(page.getByTestId('finger-picked')).toHaveCount(0);
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '1');
});

test('Delete and the number keys in Draw mode act on the drawing, never on a note you had picked', async ({
  page,
}) => {
  await createPiece(page, 'Draw Keeps Fingers', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await page.getByTestId('playalong-compact').click();
  await settle(page);
  const fingerFile = 'pieces/draw-keeps-fingers/fingering.json';

  await expect(async () => {
    const at = await blockCentre(page, 71);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('finger-picked')).toBeVisible({ timeout: 1500 });
  }).toPass();
  await page.keyboard.press('3');
  await expect(canvas).toHaveAttribute('data-fingers', /^[1-9]/);
  await eventuallyInRemote(fingerFile, (t) => t.includes('"3"'));

  await page.getByTestId('playalong-compact').click();
  await page.getByTestId('notation-draw').click();
  await expect(page.getByTestId('finger-picked')).toHaveCount(0);
  await settle(page);
  const note = await blockCentre(page, 71);
  const marks = page.getByTestId('falling-marks');
  await page.locator('.playalong [data-tool="stamp"]').click();
  await page.mouse.click(note.x, note.y);
  await expect(marks).toHaveAttribute('data-items', '1');
  await eventuallyInRemote(fallingFile.replace('falling-marks', 'draw-keeps-fingers'), (t) =>
    t.includes('"stamp"'),
  );

  await page.keyboard.press('v');
  await settle(page);
  const stamp = await centre(marks.locator('text', { hasText: /^1$/ }).first());
  await page.mouse.click(stamp.x, stamp.y);
  await page.keyboard.press('5');
  await page.keyboard.press('Delete');
  await expect(marks).toHaveAttribute('data-items', '0');
  await eventuallyInRemote(
    fallingFile.replace('falling-marks', 'draw-keeps-fingers'),
    (t) => !t.includes('"stamp"'),
  );

  await expect(canvas).toHaveAttribute('data-fingers', /^[1-9]/);
  const kept = await eventuallyInRemote(fingerFile, (t) => t.includes('"3"'));
  expect(kept).not.toContain('"5"');
  expect(remoteLog('%B').join('\n')).not.toContain('Clear finger');
});

test('a MIDI file has no notation to draw on, but its falling notes can be drawn on', async ({
  page,
}) => {
  const id = await createPiece(page, 'Midi Marks', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'Fixture Waltz.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from(makeMidi(PIANO_WALTZ)),
  });
  await expect(page.getByTestId('playalong-canvas')).toHaveAttribute('data-blocks', /71:/);
  await expect(page.getByTestId('notation-frame')).toHaveCount(0);
  await page.getByTestId('notation-draw').click();
  await expect(page.getByTestId('falling-marks')).toHaveClass(/is-editable/);
  await settle(page);
  const note = await blockCentre(page, 71);
  await page.keyboard.press('p');
  await page.mouse.move(note.x - 20, note.y);
  await page.mouse.down();
  await page.mouse.move(note.x + 20, note.y - 10, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('falling-marks')).toHaveAttribute('data-items', '1');
  await eventuallyInRemote(`pieces/${id}/annotations/fixture-waltz.mid.falling.json`, (t) =>
    t.includes('"stroke"'),
  );
  expect(remoteLog('%s').join('\n')).toContain(
    "Draw on the falling notes in 'Midi Marks' (fixture-waltz.mid bar",
  );
});

test('the suggested fingering control says how to put your own number over the grey guess', async ({
  page,
}) => {
  await createPiece(page, 'Fingering Help', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  await expect(page.getByTestId('playalong-suggest-help-text')).toHaveCount(0);
  const help = page.getByTestId('playalong-suggest-help');
  await expect(help).toHaveAccessibleName(tips.common.help(tips.playAlong.suggestName));
  await help.click();
  const text = page.getByTestId('playalong-suggest-help-text');
  await expect(text).toBeVisible();
  for (const line of strings.playAlong.suggestHelp) await expect(text).toContainText(line);
  await help.click();
  await expect(page.getByTestId('playalong-suggest-help-text')).toHaveCount(0);
});
