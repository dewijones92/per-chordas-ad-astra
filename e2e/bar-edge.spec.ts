import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

async function barYs(page: Page): Promise<Map<number, number>> {
  const raw = (await page.getByTestId('playalong-canvas').getAttribute('data-bars')) ?? '';
  return new Map(
    raw
      .split(' ')
      .filter(Boolean)
      .map((b) => b.split(':').map(Number) as [number, number]),
  );
}

test('dragging along the bar numbers at the edge of the falling notes loops from beat to beat, or whole bars; a click goes to the bar', async ({
  page,
}) => {
  await createPiece(page, 'Edge Loop', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'Fixture Waltz.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
  });
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: tips.playAlong.lookAheadMore }).click();
  await expect(page.locator('[data-testid="notation-frame"] svg').first()).toBeVisible();
  const measure = async () => {
    let last = '';
    await expect
      .poll(async () => {
        await page.waitForTimeout(300);
        const now = JSON.stringify([
          await canvas.boundingBox(),
          await canvas.getAttribute('data-bars'),
        ]);
        const same = now === last;
        last = now;
        return same;
      })
      .toBe(true);
    const ys = await barYs(page);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    return { box, at: (bar: number) => box.y + (ys.get(bar) ?? 0), count: ys.size };
  };
  const first = await measure();
  expect(first.count).toBeGreaterThanOrEqual(3);
  let { box, at } = first;

  await page.mouse.move(box.x + 10, at(0));
  await expect(canvas).toHaveAttribute('title', tips.playAlong.barEdge);
  const half = (at(0) - at(1)) / 2;
  await page.mouse.move(box.x + 10, at(0) + half - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, at(1) - half + 3, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('playalong-loop')).toContainText(
    strings.playAlong.loopBars('1', '2'),
  );
  await expect(page.getByTestId('playalong-loop-on')).toBeChecked();
  ({ box, at } = await measure());

  await page.mouse.move(box.x + 10, at(0));
  await page.mouse.down();
  await page.mouse.move(box.x + 10, (at(0) + at(1)) / 2, { steps: 4 });
  await page.mouse.move(box.x + 60, at(1), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('playalong-loop')).toContainText(
    strings.playAlong.loopBeats(1, 2, 2, 2),
  );
  await expect(page.getByTestId('finger-picked')).toHaveCount(0);

  await page.mouse.click(box.x + 10, at(1));
  await expect(page.getByTestId('playalong-position')).toContainText('📍 Bar 2 ·');
  await expect.poll(async () => (await barYs(page)).has(3)).toBe(true);
  const after = await barYs(page);
  await page.mouse.click(box.x + 10, box.y + (after.get(3) ?? 0));
  await expect(page.getByTestId('playalong-position')).toContainText('📍 Bar 3 ·');
  await expect(page.getByTestId('playalong-loop')).toContainText(
    strings.playAlong.loopBeats(1, 2, 2, 2),
  );
});
