import { expect, test } from '@playwright/test';

test('the metronome ticks and can be stopped', async ({ page }) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Faster' }).click();
  await expect(page.getByTestId('metronome-bpm')).toContainText('81');
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
