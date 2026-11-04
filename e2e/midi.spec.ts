import { makeMidi, PIANO_WALTZ, type FixtureScore } from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, openLibrary } from './support/helpers.ts';
import { strings } from '../apps/web/src/strings.ts';

const midiFile = (name: string, score: FixtureScore = PIANO_WALTZ) => ({
  name,
  mimeType: 'audio/midi',
  buffer: Buffer.from(makeMidi(score)),
});

const pressedKeys = async (page: Page) =>
  ((await page.getByTestId('playalong-canvas').getAttribute('data-pressed')) ?? '')
    .split(' ')
    .filter(Boolean)
    .map((pair) => pair.split(':')[0] ?? '')
    .sort();

test('a MIDI file plays as falling notes, says what it was written for, shows no notation, and transposes', async ({
  page,
}) => {
  const id = await createPiece(page, 'Midi Practice', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(midiFile('Fixture Waltz.mid'));
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-part')).toHaveText([/Piano RH/, /Piano LH/]);
  await expect(page.getByTestId('playalong-key')).toContainText('G major');
  await expect.poll(() => pressedKeys(page)).toEqual(['43', '71']);

  const check = page.getByTestId('file-check');
  await expect(check).toHaveAttribute('data-verdict', 'piano');
  await expect(check).toContainText(strings.fileCheck.layout.grand);

  await expect(page.getByTestId('playalong-notation')).toHaveCount(0);
  await expect(page.getByTestId('notation-draw')).toBeVisible();
  await expect(page.getByTestId('notation-frame')).toHaveCount(0);
  await expect(
    page.getByTestId('playalong-export').getByRole('button', { name: strings.playAlong.exportXml }),
  ).toBeDisabled();
  await expect(
    page
      .getByTestId('playalong-export')
      .getByRole('button', { name: strings.playAlong.exportMidi }),
  ).toBeEnabled();

  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(
      async () => Number(await page.getByTestId('playalong-canvas').getAttribute('data-position')),
      {
        timeout: 8000,
      },
    )
    .toBeGreaterThan(0.5);
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await eventuallyInRemote(`pieces/${id}/piece.json`, (t) => t.includes('"transpose": 2'));

  await page.reload();
  await expect(page.getByTestId('playalong-key')).toContainText('now A major');
  await expect(page.getByTestId('playalong-notation')).toHaveCount(0);
});

test('a new piece can start from a MIDI file, named from it, or from its file name when it has no title', async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  const dialog = page.getByTestId('new-piece-dialog');
  await dialog
    .locator('input[name="music"]')
    .setInputFiles(midiFile('whatever.mid', { ...PIANO_WALTZ, title: 'Midi Waltz' }));
  await expect(dialog.locator('input[name="title"]')).toHaveValue('Midi Waltz');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/piece\/midi-waltz$/);
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  await expect(page.getByTestId('playalong-key')).toContainText('G major');
  await eventuallyInRemote('pieces/midi-waltz/piece.json', (t) =>
    t.includes('"file": "whatever.mid"'),
  );

  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  await dialog
    .locator('input[name="music"]')
    .setInputFiles(midiFile('Untitled Tune.mid', { ...PIANO_WALTZ, title: '' }));
  await expect(dialog.locator('input[name="title"]')).toHaveValue('Untitled Tune');
});

test('a .mid file that is not MIDI is refused with the reason', async ({ page }) => {
  await createPiece(page, 'Not Really Midi', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles({
    name: 'fake.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from('this is plain text'),
  });
  await expect(page.locator('span.error')).toContainText('That .mid file is not a MIDI file');
  await expect(page.getByTestId('playalong-canvas')).toHaveCount(0);
});
