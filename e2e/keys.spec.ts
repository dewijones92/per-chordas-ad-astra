import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { expect, test, type Page } from '@playwright/test';
import { createPiece } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

const playAlong = (page: Page) => page.getByTestId('playalong-play');
const metronome = (page: Page) => page.getByTestId('metronome-toggle');

test('Space plays and pauses the play-along whatever has focus, and M runs the metronome', async ({
  page,
}) => {
  const metronomeStarts: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('dewidebug metronome start')) metronomeStarts.push(m.text());
  });
  await createPiece(page, 'Keys Etude');
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();

  await page.locator('[data-piece-view="notes"]').click();
  await page.getByTestId('playalong-canvas').click();
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1000);
  expect(metronomeStarts).toEqual([]);
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');

  const click = page.getByTestId('playalong-click');
  await click.click();
  const clickOn = await click.isChecked();
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await click.isChecked()).toBe(clickOn);
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('slider', { name: tips.playAlong.speedLabel }).focus();
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'true');

  await playAlong(page).click();
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');

  await page.locator('[data-piece-view="split"]').click();
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('k');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('m');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('m');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'false');

  await page.locator('[data-piece-view="score"]').click();
  await expect(page.getByTestId('playalong-canvas')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: strings.keys.button }).click();
  const list = page.getByTestId('keys-help');
  await expect(list).toContainText(strings.keys.playPause);
  await expect(list).toContainText(strings.keys.metronome);
});

test('Space and M run the metronome on the metronome page, and a text box still types a space', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.locator('body').click();
  await page.keyboard.press('Space');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'false');

  await createPiece(page, 'Typing Etude');
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  const percent = page.getByTestId('playalong-speed');
  await percent.focus();
  await page.keyboard.press('Space');
  await expect(playAlong(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(metronome(page)).toHaveAttribute('aria-pressed', 'false');
});
