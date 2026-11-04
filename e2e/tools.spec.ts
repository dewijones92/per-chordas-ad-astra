import { expect, test } from '@playwright/test';
import { CLICK_PITCHES, eventuallyInRemote, remoteLog, watchVoices } from './support/helpers.ts';
import { strings } from '../apps/web/src/strings.ts';

test('the metronome ticks and can be stopped', async ({ page }) => {
  await page.goto('/tools');
  const bpm = page.getByTestId('metronome-bpm').locator('.bpm-number');
  await page.waitForLoadState('networkidle');
  const before = Number(await bpm.textContent());
  await page.getByRole('button', { name: 'Faster' }).click();
  await expect(bpm).toHaveText(String(before + 1));
  await page.getByTestId('metronome-toggle').click();
  await expect
    .poll(
      async () => Number(await page.getByTestId('metronome-beats').getAttribute('data-played')),
      { timeout: 5000 },
    )
    .toBeGreaterThan(2);
  await expect(page.locator('.mini-metro')).toBeVisible();
  await page.getByTestId('metronome-toggle').click();
  await expect(page.locator('.mini-metro')).toHaveCount(0);
});

test('the metronome can play a drum beat instead of the click, in a groove that sets the beats, and remembers it', async ({
  page,
}) => {
  const voices = await watchVoices(page);
  await page.goto('/tools');
  await page.waitForLoadState('networkidle');
  const sound = page.getByTestId('metronome-sound');
  const groove = page.getByTestId('metronome-groove');
  const beats = page.locator('[data-testid="metronome-beats"] .beat');
  const played = async () =>
    Number(await page.getByTestId('metronome-beats').getAttribute('data-played'));

  await expect(sound.locator('[data-choice="click"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(groove).toHaveCount(0);
  await page.locator('.tempo-slider').fill('240');
  await sound.locator('[data-choice="drums"]').click();
  await expect(sound.locator('[data-choice="drums"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(groove).toHaveValue('rock');
  await expect(beats).toHaveCount(4);

  await groove.selectOption({ label: strings.metronome.grooves.waltz });
  await expect(groove).toHaveValue('waltz');
  await expect(beats).toHaveCount(3);

  const before = (await voices()).length;
  await page.getByTestId('metronome-toggle').click();
  await expect.poll(played, { timeout: 8000 }).toBeGreaterThan(8);
  await page.getByTestId('metronome-toggle').click();
  const heard = (await voices()).slice(before);
  const kicks = heard.filter((v) => v.kind === 'osc' && v.type === 'sine');
  const snares = heard.filter((v) => v.kind === 'osc' && v.type === 'triangle');
  expect(kicks.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs(snares.length - 2 * kicks.length)).toBeLessThanOrEqual(2);
  expect(heard.filter((v) => v.kind === 'noise').length).toBeGreaterThan(snares.length);
  expect(heard.filter((v) => v.type === 'triangle' && CLICK_PITCHES.includes(v.hz))).toHaveLength(
    0,
  );

  const json = await eventuallyInRemote(
    'settings.json',
    (t) => t.includes('"sound": "drums"') && t.includes('"groove": "waltz"'),
  );
  expect(JSON.parse(json)).toMatchObject({
    metronome: { sound: 'drums', groove: 'waltz', beatsPerBar: 3, bpm: 240 },
  });

  await page.reload();
  await expect(sound.locator('[data-choice="drums"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(groove).toHaveValue('waltz');
  await expect(beats).toHaveCount(3);

  await groove.selectOption({ label: strings.metronome.grooves.rock });
  await expect(beats).toHaveCount(4);
  await sound.locator('[data-choice="click"]').click();
  await expect(groove).toHaveCount(0);
  await page.locator('.tempo-slider').fill('80');
  await eventuallyInRemote(
    'settings.json',
    (t) => t.includes('"sound": "click"') && t.includes('"bpm": 80'),
  );
  expect(remoteLog().join('\n')).toMatch(/Metronome: .*sound drums → click/);
});

test('the tuner hears an A2 from the microphone', async ({ page }) => {
  await page.goto('/tools');
  await page.getByTestId('tuner-toggle').click();
  const readout = page.getByTestId('tuner-readout');
  await expect(readout).toHaveAttribute('data-note', 'A2', { timeout: 15_000 });
  await expect
    .poll(async () => Math.abs(Number(await readout.getAttribute('data-cents'))), {
      timeout: 5_000,
    })
    .toBeLessThan(2);
  console.info('dewidebug tuner e2e reading', { hz: await readout.getAttribute('data-hz') });
  await page.getByTestId('tuner-toggle').click();
});
