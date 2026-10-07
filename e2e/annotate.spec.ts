import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, waitForGitHub } from './support/helpers.ts';

interface Doc {
  pages: Record<string, { kind: string; text?: string; glyph?: string }[]>;
}

async function layerBox(page: Page) {
  const layer = page.getByTestId('annotation-layer-1');
  await expect(layer).toBeVisible();
  const box = await layer.boundingBox();
  if (!box) throw new Error('no layer box');
  return box;
}

test('drawings, stamps and text are saved to GitHub and survive a reload', async ({ page }) => {
  await createPiece(page, 'Annotated Etude');
  const box = await layerBox(page);

  await page.mouse.move(box.x + 60, box.y + 80);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 60 + i * 6, box.y + 80 + (i % 5) * 3);
  await page.mouse.up();

  await page.keyboard.press('s');
  await page.getByRole('button', { name: 'Finger 3' }).click();
  await page.mouse.click(box.x + 150, box.y + 160);

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 80, box.y + 220);
  await page.getByTestId('text-editor').fill('Slow! 60 bpm first');
  await page.keyboard.press('Control+Enter');

  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '3');
  await waitForGitHub(page);
  const doc = JSON.parse(
    await eventuallyInRemote('pieces/annotated-etude/annotations/annotated-etude.pdf.json', (t) =>
      t.includes('Slow!'),
    ),
  ) as Doc;
  expect(doc.pages['1']?.map((i) => i.kind)).toEqual(['stroke', 'stamp', 'text']);
  expect(doc.pages['1']?.[1]?.glyph).toBe('3');

  await page.reload();
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '3');
});

test('undo, redo and the eraser change what is saved', async ({ page }) => {
  await createPiece(page, 'Eraser Study');
  const box = await layerBox(page);
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 160, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '1');

  const file = 'pieces/eraser-study/annotations/eraser-study.pdf.json';
  await eventuallyInRemote(file, (t) => t.includes('"rect"'));

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '0');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '1');

  await page.keyboard.press('e');
  await page.mouse.move(box.x + 90, box.y + 130);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 130, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('annotation-layer-1')).toHaveAttribute('data-items', '0');
  await eventuallyInRemote(
    file,
    (t) => (JSON.parse(t) as { pages: Record<string, unknown> }).pages['1'] === undefined,
  );
});

test('a bookmark is saved and jumps back to its page', async ({ page }) => {
  await createPiece(page, 'Long Piece');
  await expect(page.getByTestId('score-scroller')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('.page')).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  page.once('dialog', (d) => void d.accept('Bars 17-32'));
  await page.getByTestId('add-bookmark').click();
  const jump = page
    .getByTestId('jump-bar')
    .getByRole('button', { name: 'Bars 17-32', exact: true });
  await expect(jump).toBeVisible();
  const piece = JSON.parse(
    await eventuallyInRemote('pieces/long-piece/piece.json', (t) => t.includes('Bars 17-32')),
  ) as {
    bookmarks: { page: number }[];
  };
  expect(piece.bookmarks[0]?.page).toBe(2);

  await page.keyboard.press('Home');
  await page.getByTestId('score-scroller').evaluate((el) => {
    el.scrollTop = 0;
  });
  await jump.click();
  await expect
    .poll(() => page.getByTestId('score-scroller').evaluate((el) => el.scrollTop), {
      timeout: 5000,
    })
    .toBeGreaterThan(300);
});
