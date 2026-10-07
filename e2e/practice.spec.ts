import { expect, test } from '@playwright/test';
import { createPiece, eventuallyInRemote, toneFile } from './support/helpers.ts';

test('a timed practice session is logged with its tempo', async ({ page }) => {
  await createPiece(page, 'Scales', { pdf: false });
  await page.getByTestId('practice-start').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('practice-finish').click();
  await page.getByTestId('practice-bpm').fill('92');
  await page.getByTestId('practice-save').click();
  await expect(page.getByText('1 sessions')).toBeVisible();

  const month = new Date().toISOString().slice(0, 7).replace('-', '/');
  const log = await eventuallyInRemote(`log/${month}.jsonl`, (t) => t.includes('"scales"'));
  expect(log).toContain('"bpm":92');

  await page.goto('/log');
  await expect(page.getByTestId('session-list')).toContainText('Scales');
  await expect(page.getByTestId('session-list')).toContainText('92 bpm');
});

test('a backing track slows down, loops, and its saved loop reaches GitHub', async ({ page }) => {
  await createPiece(page, 'Jam Track', { pdf: false });
  await page.getByTestId('upload-track').setInputFiles(toneFile('Backing.wav'));
  await expect(page.getByTestId('looper-audio')).toHaveCount(1);
  await expect(page.locator('.waveform canvas')).toBeVisible();

  await page.getByTestId('looper-rate').selectOption('0.75');
  expect(
    await page
      .getByTestId('looper-audio')
      .evaluate((a: HTMLAudioElement) => [a.playbackRate, a.preservesPitch]),
  ).toEqual([0.75, true]);

  await page.getByTestId('looper-play').click();
  await expect
    .poll(() => page.getByTestId('looper-audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.3);
  await page.getByTestId('looper-play').click();

  const wave = await page.getByTestId('waveform').boundingBox();
  if (!wave) throw new Error('no waveform');
  await page.mouse.move(wave.x + wave.width * 0.25, wave.y + wave.height / 2);
  await page.mouse.down();
  await page.mouse.move(wave.x + wave.width * 0.5, wave.y + wave.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('looper-loop')).toContainText('0:02.0 → 0:04.0');

  page.once('dialog', (d) => void d.accept('Middle bit'));
  await page.getByTestId('looper-save').click();
  const loops = JSON.parse(
    await eventuallyInRemote('pieces/jam-track/loops.json', (t) => t.includes('Middle bit')),
  ) as {
    tracks: Record<string, { name: string; rate: number; startSec: number }[]>;
  };
  expect(loops.tracks['backing.wav']?.[0]).toMatchObject({ name: 'Middle bit', rate: 0.75 });
});

test('a note typed just before leaving the piece is still saved', async ({ page }) => {
  await createPiece(page, 'Quick Note', { pdf: false });
  await page.getByText('📝 Notes').click();
  await page.getByTestId('piece-notes').fill('use the thumb on bar 12');
  await page.locator('.nav').getByRole('link', { name: 'Library', exact: true }).click();
  await eventuallyInRemote('pieces/quick-note/piece.json', (t) =>
    t.includes('use the thumb on bar 12'),
  );
});

test('a loop that ends at the end of the track keeps looping', async ({ page }) => {
  await createPiece(page, 'Loop To End', { pdf: false });
  await page.getByTestId('upload-track').setInputFiles(toneFile('Tail.wav', 4));
  await expect(page.locator('.waveform canvas')).toBeVisible();
  const wave = await page.getByTestId('waveform').boundingBox();
  if (!wave) throw new Error('no waveform');
  await page.mouse.move(wave.x + wave.width * 0.5, wave.y + wave.height / 2);
  await page.mouse.down();
  await page.mouse.move(wave.x + wave.width - 1, wave.y + wave.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('looper-loop')).toContainText('→ 0:04.0');
  await page.getByTestId('looper-play').click();
  await page.waitForTimeout(3500);
  const state = await page
    .getByTestId('looper-audio')
    .evaluate((a: HTMLAudioElement) => ({ paused: a.paused, t: a.currentTime }));
  expect(state.paused).toBe(false);
  expect(state.t).toBeGreaterThanOrEqual(1.9);
  await page.getByTestId('looper-play').click();
});
