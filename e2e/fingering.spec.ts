import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { Fingering } from '../packages/shared/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, remoteLog } from './support/helpers.ts';
import { strings, tips, units } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

async function clickNote(page: Page, pitch: number): Promise<void> {
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
  await page.getByTestId('playalong-compact').click();
  await expect(canvas).toBeInViewport();
  await expect(canvas).toHaveAttribute('data-fingers', '0');

  const before = await canvas.boundingBox();
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
