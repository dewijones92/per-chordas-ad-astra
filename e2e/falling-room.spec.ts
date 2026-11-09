import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

const lookAhead = async (page: Page) =>
  Number(await page.getByTestId('playalong-canvas').getAttribute('data-look-ahead'));

const frameHeight = async (page: Page) =>
  (await page.getByTestId('notation-frame').boundingBox())?.height ?? 0;

test('the falling notes zoom out to show more, the stave resizes, the settings fold away, and all of it is remembered', async ({
  page,
}) => {
  await createPiece(page, 'Room Etude');
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.page canvas').first()).toBeVisible();
  const pdfZoom = await page.getByTestId('zoom-level').textContent();

  expect(await lookAhead(page)).toBe(3);
  await expect(page.getByTestId('playalong-look-ahead-value')).toHaveText('3 s');
  await page.getByRole('button', { name: tips.playAlong.lookAheadMore }).click();
  await expect(page.getByTestId('playalong-look-ahead-value')).toHaveText('4 s');
  await page.getByRole('button', { name: tips.playAlong.lookAheadLess }).click();
  await page.getByRole('button', { name: tips.playAlong.lookAheadLess }).click();
  await expect(page.getByTestId('playalong-look-ahead-value')).toHaveText('2 s');

  await expect(page.getByTestId('playalong-transpose')).toBeVisible();
  await page.getByTestId('playalong-compact').click();
  await expect(page.getByTestId('playalong-transpose')).toBeHidden();
  await expect(page.getByTestId('playalong-compact')).toHaveText(strings.playAlong.moreControls);
  await expect(page.getByTestId('playalong-look-ahead')).toBeVisible();
  await expect(canvas).toBeInViewport({ ratio: 0.5 });
  const docked = page.getByTestId('dock-playbar');
  for (const id of ['playalong-play', 'playalong-position', 'playalong-compact', 'playalong-speed'])
    await expect(docked.getByTestId(id)).toBeVisible();
  await expect(docked.getByTestId('playalong-position')).toContainText('📍 Bar 1 ·');
  const bar = await docked.boundingBox();
  const notes = await canvas.boundingBox();
  if (!bar || !notes) throw new Error('no boxes');
  expect(bar.x).toBeGreaterThanOrEqual(notes.x + notes.width - 1);

  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.keyboard.down('Control');
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect.poll(() => lookAhead(page)).toBeGreaterThan(6);
  expect(await page.getByTestId('zoom-level').textContent()).toBe(pdfZoom);
  const position = await canvas.getAttribute('data-position');
  expect(Number(position)).toBe(0);

  await page.locator('[data-piece-view="notes"]').click();
  await expect(page.getByTestId('notation-frame')).toBeVisible();
  const before = await frameHeight(page);
  const handle = page.getByTestId('playalong-resize');
  await expect(handle).toHaveAttribute('title', tips.playAlong.resize);
  const h = await handle.boundingBox();
  if (!h) throw new Error('no handle');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 120, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => frameHeight(page)).toBeGreaterThan(before + 100);
  const dragged = await frameHeight(page);

  const zoomedOut = await lookAhead(page);
  await page.reload();
  await expect(canvas).toBeVisible();
  expect(await lookAhead(page)).toBe(zoomedOut);
  await expect(page.getByTestId('playalong-transpose')).toBeHidden();
  await expect.poll(() => frameHeight(page)).toBeCloseTo(dragged, -1);

  await page.getByTestId('playalong-compact').click();
  await expect(page.getByTestId('playalong-transpose')).toBeVisible();
  await expect(page.getByTestId('dock-playbar').getByTestId('playalong-play')).toHaveCount(0);
  await expect(page.getByTestId('playalong').getByTestId('playalong-position')).toContainText(
    '📍 Bar 1 ·',
  );
  await page.getByTestId('playalong-resize').dblclick();
  await expect(page.getByTestId('notation-frame')).not.toHaveAttribute('style', /height/);
});
