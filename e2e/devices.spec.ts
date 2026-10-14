import { expect, test, type Page } from '@playwright/test';
import { createPiece, eventuallyInRemote, openLibrary, remoteLog } from './support/helpers.ts';

interface ServerResume {
  zoom: Record<string, { value: number }>;
  viewMode: { mode: string } | null;
  librarySort: { sort: string; reversed: boolean } | null;
}

const serverResume = async (page: Page): Promise<ServerResume> =>
  (await (await page.request.get('/api/resume')).json()) as ServerResume;

const bpmOf = (page: Page) => page.getByTestId('metronome-bpm').locator('.bpm-number');

test('metronome settings are saved to GitHub and follow you to another browser', async ({
  browser,
  page,
}) => {
  await page.goto('/tools');
  await page.waitForLoadState('networkidle');
  const start = Number(await bpmOf(page).textContent());
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Faster' }).click();
  await expect(bpmOf(page)).toHaveText(String(start + 3));

  const json = await eventuallyInRemote('settings.json', (t) =>
    t.includes(`"bpm": ${String(start + 3)}`),
  );
  expect(JSON.parse(json)).toMatchObject({ metronome: { bpm: start + 3 } });
  expect(remoteLog().join('\n')).toMatch(/Metronome: bpm|Save metronome settings/);

  const laptop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const other = await laptop.newPage();
  await other.goto('/tools');
  await expect(bpmOf(other)).toHaveText(String(start + 3));

  for (let i = 0; i < 3; i++) await other.getByRole('button', { name: 'Slower' }).click();
  await expect(bpmOf(other)).toHaveText(String(start));
  await eventuallyInRemote('settings.json', (t) => t.includes(`"bpm": ${String(start)}`));
  await laptop.close();
});

test('zoom per score, the page layout and the library sort follow you to another browser', async ({
  browser,
  page,
}) => {
  const id = await createPiece(page, 'Far Zoom');
  await expect(page.locator('.page')).toHaveCount(3);
  await page.keyboard.press('Control+Equal');
  await page.keyboard.press('Control+Equal');
  await expect(page.getByTestId('zoom-level')).toHaveText('120%');
  await page.locator('[data-view="width"]').click();
  await openLibrary(page);
  await page.getByLabel('Sort pieces').selectOption({ label: 'Recently added' });

  const key = `${id}/${id}.pdf`;
  await expect
    .poll(
      async () => {
        const s = await serverResume(page);
        return [s.zoom[key]?.value.toFixed(2), s.viewMode?.mode, s.librarySort?.sort];
      },
      { timeout: 8000 },
    )
    .toEqual(['1.20', 'width', 'added']);

  const laptop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const other = await laptop.newPage();
  await other.goto(`/piece/${id}`);
  await expect(other.getByTestId('zoom-level')).toHaveText('120%');
  await expect(other.locator('[data-view="width"]')).toHaveAttribute('aria-pressed', 'true');
  await openLibrary(other);
  await expect(other.getByLabel('Sort pieces')).toHaveValue('added');

  await other.getByLabel('Sort pieces').selectOption({ label: 'Title A–Z' });
  await other.goto(`/piece/${id}`);
  await other.locator('[data-view="page"]').click();
  await expect
    .poll(
      async () => {
        const s = await serverResume(page);
        return [s.viewMode?.mode, s.librarySort?.sort];
      },
      { timeout: 8000 },
    )
    .toEqual(['page', 'title']);
  await laptop.close();
});

test('a new score opens at 100% whatever another score was zoomed to', async ({ page }) => {
  await createPiece(page, 'Unzoomed Etude');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
});
