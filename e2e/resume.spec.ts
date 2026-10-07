import { expect, test } from '@playwright/test';
import { createPiece, toneFile } from './support/helpers.ts';

test('reopening the app returns to the piece, page, timer and looper speed you left', async ({
  page,
}) => {
  const id = await createPiece(page, 'Resume Study');
  await page.getByTestId('upload-track').setInputFiles(toneFile('Groove.wav'));
  await expect(page.getByTestId('looper-audio')).toHaveCount(1);
  await page.getByTestId('looper-rate').selectOption('0.7');

  await expect(page.locator('.page')).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.getByTestId('score-scroller').evaluate((el) => el.scrollTop), {
      timeout: 5000,
    })
    .toBeGreaterThan(300);
  const scrolled = await page.getByTestId('score-scroller').evaluate((el) => el.scrollTop);

  await page.getByTestId('practice-start').click();
  await page.waitForTimeout(1300);
  await page.waitForTimeout(400);

  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/piece/${id}$`));
  await expect(page.locator('.page')).toHaveCount(3);
  await expect
    .poll(() => page.getByTestId('score-scroller').evaluate((el) => el.scrollTop), {
      timeout: 5000,
    })
    .toBeGreaterThan(scrolled - 40);
  await expect(page.getByTestId('practice-clock')).not.toHaveText('0:00');
  await expect(page.getByTestId('practice-start')).toHaveText(/Resume/);
  await expect(page.getByTestId('looper-rate')).toHaveValue('0.7');
});

test('leaving from the library reopens the library', async ({ page }) => {
  await createPiece(page, 'Somewhere Else', { pdf: false });
  await page.getByRole('link', { name: 'Library' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('another device opens where this one left off', async ({ browser, page }) => {
  const id = await createPiece(page, 'Two Devices');
  await expect(page.locator('.page')).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.getByTestId('score-scroller').evaluate((el) => el.scrollTop), {
      timeout: 5000,
    })
    .toBeGreaterThan(900);
  const key = `${id}/${id}.pdf`;
  await expect
    .poll(
      async () => {
        const local = await page.evaluate(
          (k) =>
            (
              JSON.parse(localStorage.getItem('pcaa.resume.v2') ?? '{}') as {
                scores?: Record<string, unknown>;
              }
            ).scores?.[k],
          key,
        );
        const server = (
          (await (await page.request.get('/api/resume')).json()) as {
            scores: Record<string, unknown>;
          }
        ).scores[key];
        return local !== undefined && JSON.stringify(local) === JSON.stringify(server)
          ? (server as { page: number }).page
          : null;
      },
      { timeout: 8000 },
    )
    .toBe(3);

  const phone = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const other = await phone.newPage();
  await other.goto('/');
  await expect(other).toHaveURL(new RegExp(`/piece/${id}$`));
  await expect(other.locator('.page')).toHaveCount(3);
  await expect
    .poll(() => other.getByTestId('score-scroller').evaluate((el) => el.scrollTop), {
      timeout: 5000,
    })
    .toBeGreaterThan(900);
  await phone.close();
});
