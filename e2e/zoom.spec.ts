import { expect, test, type Page } from '@playwright/test';
import { createPiece } from './support/helpers.ts';

async function pageWidth(page: Page): Promise<number> {
  const box = await page.locator('.page').first().boundingBox();
  if (!box) throw new Error('no page box');
  return box.width;
}

async function watchDefaultPrevented(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { zoomSeen: string[] }).zoomSeen = seen;
    for (const type of ['keydown', 'wheel'] as const) {
      window.addEventListener(type, (e) => {
        if (e instanceof KeyboardEvent && !(e.ctrlKey && ['=', '-', '0'].includes(e.key))) return;
        if (e instanceof WheelEvent && !e.ctrlKey) return;
        seen.push(`${type}:${String(e.defaultPrevented)}`);
      });
    }
  });
}

const seen = (page: Page) =>
  page.evaluate(() => (window as unknown as { zoomSeen: string[] }).zoomSeen);

test('Ctrl +, −, 0 and Ctrl+wheel zoom the score instead of the browser', async ({ page }) => {
  await createPiece(page, 'Zoomed Study');
  const level = page.getByTestId('zoom-level');
  await expect(level).toHaveText('100%');
  await expect(page.locator('.page').first()).toBeVisible();
  const start = await pageWidth(page);
  const bpm = (await page.getByTestId('metronome-bpm').textContent()) ?? '';
  await watchDefaultPrevented(page);

  await page.keyboard.press('Control+Equal');
  await page.keyboard.press('Control+Equal');
  await expect(level).toHaveText('120%');
  await expect.poll(() => pageWidth(page)).toBeGreaterThan(start * 1.15);
  await expect(page.getByTestId('metronome-bpm')).toHaveText(bpm);

  await page.keyboard.press('Control+Minus');
  await expect(level).toHaveText('110%');
  await page.keyboard.press('Control+0');
  await expect(level).toHaveText('100%');
  await expect.poll(() => pageWidth(page)).toBeCloseTo(start, 0);

  const scroller = await page.getByTestId('score-scroller').boundingBox();
  if (!scroller) throw new Error('no scroller box');
  await page.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => parseInt((await level.textContent()) ?? '0', 10))
    .toBeGreaterThan(105);
  await expect.poll(() => pageWidth(page)).toBeGreaterThan(start * 1.05);

  const events = await seen(page);
  expect(events.length).toBeGreaterThanOrEqual(5);
  expect(events.filter((e) => e.endsWith(':false'))).toEqual([]);
});
