import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, waitForGitHub } from './support/helpers.ts';

interface Doc {
  pages: Record<string, { kind: string; paths?: [number, number][][] }[]>;
  pdfImport?: { converted: number; hidePdfAnnotations: boolean };
}

const SKETCH_CENTRE = { x: 130, y: 202 };

async function canvasIsRedAt(page: Page, x: number, y: number): Promise<boolean> {
  return page.locator('.page[data-page="1"] canvas').evaluate(
    (canvas: HTMLCanvasElement, p) => {
      const scale = canvas.width / 595;
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0) return false;
      const [r = 0, g = 0, b = 0] = ctx.getImageData(
        Math.round(p.x * scale),
        Math.round(p.y * scale),
        1,
        1,
      ).data;
      return r > 200 && g < 100 && b < 100;
    },
    { x, y },
  );
}

async function layerPoint(page: Page, x: number, y: number) {
  const box = await page.getByTestId('annotation-layer-1').boundingBox();
  if (!box) throw new Error('no layer box');
  return { x: box.x + (x * box.width) / 595, y: box.y + (y * box.height) / 842 };
}

test('marks made in another app become drawings you can move, shown once', async ({
  page,
  browser,
}) => {
  await createPiece(page, 'Marked Study', {
    pages: 1,
    marks: [
      [
        {
          kind: 'sketch',
          rect: [100, 600, 160, 680],
          colour: [255, 38, 0],
          path: '0 0 m 60 0 l 60 80 l 0 80 l h',
        },
        { kind: 'highlight', rect: [100, 500, 300, 514], colour: [251, 92, 137] },
      ],
    ],
  });
  const layer = page.getByTestId('annotation-layer-1');
  await expect(layer).toHaveAttribute('data-items', '2');
  await expect(layer.locator('path[fill="#ff2600"]')).toHaveCount(1);
  await expect(page.locator('.page[data-page="1"]')).toHaveAttribute(
    'data-pdf-annotations',
    'hidden',
  );
  await expect.poll(() => canvasIsRedAt(page, SKETCH_CENTRE.x, SKETCH_CENTRE.y)).toBe(false);
  await expect.poll(() => canvasIsRedAt(page, 20, 20)).toBe(false);

  await waitForGitHub(page);
  const path = 'pieces/marked-study/annotations/marked-study.pdf.json';
  const imported = JSON.parse(
    await eventuallyInRemote(path, (t) => t.includes('pdfImport')),
  ) as Doc;
  expect(imported.pdfImport).toMatchObject({ converted: 2, hidePdfAnnotations: true });

  await page.keyboard.press('v');
  const from = await layerPoint(page, SKETCH_CENTRE.x, SKETCH_CENTRE.y);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + i * 8, from.y + i * 4);
  await page.mouse.up();
  const moved = JSON.parse(
    await eventuallyInRemote(path, (t) => {
      const ink = (JSON.parse(t) as Doc).pages['1']?.find((i) => i.kind === 'ink');
      return (ink?.paths?.[0]?.[0]?.[0] ?? 0) > 130;
    }),
  ) as Doc;
  expect(moved.pdfImport).toMatchObject({ converted: 2 });

  await page.reload();
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '2');
  await expect(page.locator('.page[data-page="1"]')).toHaveAttribute(
    'data-pdf-annotations',
    'hidden',
  );

  const other = await (await browser.newContext()).newPage();
  await other.goto(page.url());
  await expect(other.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '2');
  await other.context().close();
});

test('a slow check for PDF marks neither blocks drawing nor moves your place', async ({ page }) => {
  await page.route('**/annotations/*/import', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await createPiece(page, 'Slow Check', { pages: 3 });
  const frame = page.locator('.score-frame');
  await expect(frame).toHaveAttribute('data-pdf-marks', 'checking');

  const from = await layerPoint(page, 100, 100);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + i * 6, from.y + i * 2);
  await page.mouse.up();
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '1');

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  const second = page.locator('.page[data-page="2"]');
  const before = await second.boundingBox();
  await expect(frame).toHaveAttribute('data-pdf-marks', 'checked', { timeout: 10_000 });
  await page.waitForTimeout(500);
  const after = await second.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0);

  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '1');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '0');
});
