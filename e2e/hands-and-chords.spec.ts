import {
  GUITAR_STYLE_WALTZ,
  makeMscx,
  makeMusicXml,
  PIANO_WALTZ,
  zipScore,
} from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

const guitarStyleChords = () => ({
  name: 'Guitar Chords.mscz',
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(
    zipScore(
      'guitar.mscx',
      makeMscx(
        {
          ...GUITAR_STYLE_WALTZ,
          measures: [
            {
              staves: [
                [{ pitches: [76], dur: 'half', dots: 1 }],
                [
                  { pitches: [48], dur: 'quarter' },
                  { pitches: [52, 55], dur: 'quarter' },
                  { pitches: [52, 55], dur: 'quarter' },
                ],
              ],
            },
          ],
        },
        '4.50',
      ),
    ),
  ),
});

const guitarStyle = () => ({
  name: 'Guitar Style.mscz',
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(zipScore('guitar.mscx', makeMscx(GUITAR_STYLE_WALTZ, '4.50'))),
});

function watchMutedLanes(page: Page): () => number[] | null {
  let latest: number[] | null = null;
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.startsWith('dewidebug play-along lanes')) return;
    void msg
      .args()[1]
      ?.jsonValue()
      .then((value) => {
        latest = (value as { muted: number[] }).muted;
      });
  });
  return () => latest;
}

const chosen = (page: Page) =>
  page.getByTestId('playalong-i-play').locator('[aria-pressed="true"]');

test('I play the right hand: it goes quiet but stays drawn, the app keeps the left, and the 👁 and 🔊 buttons agree', async ({
  page,
}) => {
  const muted = watchMutedLanes(page);
  await createPiece(page, 'Right Hand Study', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toBeVisible();
  const control = page.getByTestId('playalong-i-play');
  await expect(control).toBeVisible();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.none);
  await expect(
    control.getByRole('button', { name: strings.playAlong.iPlayModes.right }),
  ).toHaveAttribute('title', tips.playAlong.iPlayModes.right);
  await expect(page.getByTestId('playalong-i-play-help-text')).toHaveCount(0);
  await page.getByTestId('playalong-i-play-help').click();
  await expect(page.getByTestId('playalong-i-play-help-text')).toContainText(
    strings.playAlong.iPlayHelp[0],
  );

  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await control.getByRole('button', { name: strings.playAlong.iPlayModes.right }).click();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.right);
  await expect(page.getByRole('button', { name: 'Unmute Piano RH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mute Piano LH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide Piano RH' })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await expect.poll(muted).toEqual([0]);

  await control.getByRole('button', { name: strings.playAlong.iPlayModes.left }).click();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.left);
  await expect(page.getByRole('button', { name: 'Mute Piano RH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unmute Piano LH' })).toBeVisible();
  await expect.poll(muted).toEqual([1]);

  await page.reload();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.left);
  await expect(page.getByRole('button', { name: 'Unmute Piano LH' })).toBeVisible();

  await page.getByRole('button', { name: 'Hide Piano LH' }).click();
  await expect(chosen(page)).toHaveCount(0);
  await expect(page.getByTestId('playalong-i-play-note')).toHaveText(strings.playAlong.iPlayCustom);
  await page.getByRole('button', { name: 'Show Piano LH' }).click();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.left);
  await expect(page.getByTestId('playalong-i-play-note')).toHaveCount(0);

  await control.getByRole('button', { name: strings.playAlong.iPlayModes.both }).click();
  await expect(page.getByRole('button', { name: 'Unmute Piano RH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unmute Piano LH' })).toBeVisible();
  await expect.poll(muted).toEqual([0, 1]);

  await control.getByRole('button', { name: strings.playAlong.iPlayModes.none }).click();
  await expect(page.getByRole('button', { name: 'Mute Piano RH' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mute Piano LH' })).toBeVisible();
  await expect.poll(muted).toEqual([]);
});

test('I play works on the split hands too, and is only offered where a part is a hand', async ({
  page,
}) => {
  await createPiece(page, 'Split Hand Study', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(guitarStyle());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-part')).toHaveText([
    new RegExp(strings.playAlong.handNames.right),
    new RegExp(strings.playAlong.handNames.left),
  ]);
  const control = page.getByTestId('playalong-i-play');
  await control.getByRole('button', { name: strings.playAlong.iPlayModes.left }).click();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.left);
  await expect(
    page.getByRole('button', { name: `Unmute ${tips.playAlong.handNames.left}` }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Mute ${tips.playAlong.handNames.right}` }),
  ).toBeVisible();

  await page
    .getByTestId('playalong-by-hand')
    .getByRole('button', { name: strings.playAlong.handModes.parts })
    .click();
  await expect(page.getByTestId('playalong-i-play')).toHaveCount(0);
  await page
    .getByTestId('playalong-by-hand')
    .getByRole('button', { name: strings.playAlong.handModes.hands })
    .click();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.left);

  await page.reload();
  await expect(chosen(page)).toHaveText(strings.playAlong.iPlayModes.left);
});

test('chord names label the left hand once a bar, follow a transposition, and are remembered', async ({
  page,
}) => {
  await createPiece(page, 'Chord Study', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  const box = page.getByTestId('playalong-chords');
  await expect(canvas).toBeVisible();
  await expect(box).not.toBeChecked();
  await expect(page.locator('label', { has: box })).toHaveAttribute(
    'title',
    tips.playAlong.chordNames,
  );
  await expect(canvas).toHaveAttribute('data-chords', '');

  await box.check();
  await expect(canvas).toHaveAttribute('data-chords', /^G\b/);

  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(canvas).toHaveAttribute('data-chords', /^A\b/);

  await page.reload();
  await expect(page.getByTestId('playalong-chords')).toBeChecked();
  await expect(page.getByTestId('playalong-canvas')).toHaveAttribute('data-chords', /^A\b/);

  await page.getByTestId('playalong-chords').uncheck();
  await expect(page.getByTestId('playalong-canvas')).toHaveAttribute('data-chords', '');
});

test('chord names read the split left hand of a guitar-style score', async ({ page }) => {
  await createPiece(page, 'Split Chords', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(guitarStyleChords());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toBeVisible();
  await page.getByTestId('playalong-chords').check();
  await expect(canvas).toHaveAttribute('data-chords', 'C');
});

test('a dotted line joins the hands where they start together, and goes when one hand is hidden', async ({
  page,
}) => {
  await createPiece(page, 'Together Etude', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await expect(canvas).toHaveAttribute('data-joins', /^[1-9]/);
  await page.getByRole('button', { name: tips.playAlong.hide('Piano LH') }).click();
  await expect(canvas).toHaveAttribute('data-joins', '0');
  await page.getByRole('button', { name: tips.playAlong.show('Piano LH') }).click();
  await expect(canvas).toHaveAttribute('data-joins', /^[1-9]/);
});
