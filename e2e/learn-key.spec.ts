import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { expect, test } from '@playwright/test';
import { createPiece, eventuallyInRemote, learnKeySaved, openLibrary } from './support/helpers.ts';
import { tips } from '../apps/web/src/strings.ts';

const waltzXml = (name: string) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

test('music added with Start in C major ticked opens in C major, and the choice is remembered', async ({
  page,
}) => {
  await createPiece(page, 'Written Key Etude', { pdf: false });
  const toggle = page.getByTestId('learn-key');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('label', { has: toggle })).toHaveAttribute(
    'title',
    tips.playAlong.learnKey,
  );
  await page.getByTestId('upload-music').setInputFiles(waltzXml('Written.musicxml'));
  await expect(page.getByTestId('playalong-key')).toContainText('G major');

  await createPiece(page, 'C Major Etude', { pdf: false });
  await page.getByTestId('dock-playalong').locator('summary').click();
  await page.getByTestId('learn-key').check();
  await page.getByTestId('upload-music').setInputFiles(waltzXml('Shifted.musicxml'));
  await expect(page.getByTestId('playalong-key')).toContainText('C major');
  await eventuallyInRemote('pieces/c-major-etude/piece.json', (t) => t.includes('"transpose": 5'));

  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  const dialog = page.getByTestId('new-piece-dialog');
  await expect(dialog.getByTestId('learn-key')).toBeChecked();
  await dialog.locator('input[name="music"]').setInputFiles(waltzXml('From Dialog.musicxml'));
  await dialog.locator('input[name="title"]').fill('Dialog Etude');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByTestId('playalong-key')).toContainText('C major');

  await page
    .getByTestId('learn-key')
    .uncheck()
    .catch(() => undefined);
  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  await dialog.getByTestId('learn-key').uncheck();
  await learnKeySaved(page, false);
  await expect(dialog.getByTestId('learn-key')).not.toBeChecked();
});
