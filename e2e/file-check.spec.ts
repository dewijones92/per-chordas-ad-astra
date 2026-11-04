import {
  GUITAR_STYLE_WALTZ,
  makeMscx,
  PIANO_WALTZ,
  zipScore,
  type FixtureScore,
} from '../packages/fixtures/src/index.ts';
import { expect, test } from '@playwright/test';
import { createPiece } from './support/helpers.ts';
import { strings } from '../apps/web/src/strings.ts';

const pianoWithFingering: FixtureScore = {
  ...PIANO_WALTZ,
  parts: PIANO_WALTZ.parts.map((p) => ({ ...p, instrument: 'keyboard.piano' })),
  measures: PIANO_WALTZ.measures.map((m, mi) =>
    mi === 0
      ? {
          ...m,
          staves: m.staves.map((chords, si) =>
            si === 0 ? chords.map((c, ci) => (ci === 0 ? { ...c, fingers: ['3'] } : c)) : chords,
          ),
        }
      : m,
  ),
};

const mscz = (name: string, score: FixtureScore) => ({
  name,
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(zipScore('score.mscx', makeMscx(score, '4.50'))),
});

test('the file check says what the file was written for, and its piano fingering shows in red', async ({
  page,
}) => {
  await createPiece(page, 'Fingered Waltz', { pdf: false });
  await page
    .getByTestId('upload-music')
    .setInputFiles(mscz('Fingered Waltz.mscz', pianoWithFingering));
  const check = page.getByTestId('file-check');
  await expect(check).toHaveAttribute('data-verdict', 'piano');
  await expect(check).toContainText(strings.fileCheck.verdict.piano);
  await expect(check).toContainText(strings.fileCheck.layout.grand);
  await expect(check).toContainText(strings.fileCheck.pianoFingers(1));
  await page.getByTestId('file-check-help').click();
  await expect(page.getByTestId('file-check-help-text')).toContainText(strings.fileCheck.help[3]);

  await expect(page.getByTestId('playalong-canvas')).toHaveAttribute('data-fingers', /^[1-9]/);
  const fing = page.locator('.notation g.fing').first();
  await expect(fing).toBeVisible();
  await expect(fing).toContainText('3');
  const fill = await fing.evaluate((el) => getComputedStyle(el.querySelector('text') ?? el).fill);
  expect(fill).toBe('rgb(215, 38, 61)');

  await createPiece(page, 'Guitar Shaped Waltz', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(
    mscz('Guitar Shaped Waltz.mscz', {
      ...GUITAR_STYLE_WALTZ,
      parts: GUITAR_STYLE_WALTZ.parts.map((p) => ({ ...p, instrument: 'keyboard.piano' })),
    }),
  );
  const second = page.getByTestId('file-check');
  await expect(second).toHaveAttribute('data-verdict', 'unclear');
  await expect(second).toContainText(strings.fileCheck.verdict.unclear);
  await expect(second).toContainText(strings.fileCheck.declared.piano);
  await expect(second).toContainText(strings.fileCheck.layout.single);
  await expect(second).toContainText(strings.fileCheck.noFingers);
  await expect(page.getByTestId('playalong-canvas')).toHaveAttribute('data-fingers', '0');
});
