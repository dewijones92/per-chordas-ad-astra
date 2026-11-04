import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ratingLine, strings } from '../apps/web/src/strings.ts';
import { createPiece, eventuallyInRemote, openLibrary, remoteLog } from './support/helpers.ts';

const today = () => new Date().toISOString().slice(0, 10);

async function fillSource(
  form: Locator,
  values: { url: string; stars?: string; ratings?: string; views?: string },
): Promise<void> {
  await form.getByTestId('source-url').fill(values.url);
  await form.getByTestId('source-stars').fill(values.stars ?? '');
  await form.getByTestId('source-ratings').fill(values.ratings ?? '');
  await form.getByTestId('source-views').fill(values.views ?? '');
}

const sourceBox = (page: Page) => page.getByTestId('piece-source');

test('a pasted MuseScore link and the stars typed from its page stay on the piece, as a link', async ({
  page,
}) => {
  const id = await createPiece(page, 'The Lonely Waltz', { pdf: false });
  await expect(sourceBox(page)).toHaveCount(0);

  await page.getByTestId('piece-source-add').click();
  const form = page.getByTestId('source-form');
  await fillSource(form, { url: 'not a link', stars: '4.8' });
  await form.getByTestId('source-save').click();
  await expect(form.getByTestId('source-error')).toHaveText(strings.source.badLink);

  await fillSource(form, {
    url: 'musescore.com/user/123/scores/456',
    stars: '9',
    ratings: '120',
    views: '15k',
  });
  await form.getByTestId('source-save').click();
  await expect(form.getByTestId('source-error')).toHaveText(strings.source.badStars);

  await fillSource(form, {
    url: 'musescore.com/user/123/scores/456',
    stars: '4.8',
    ratings: '120',
    views: '15k',
  });
  await form.getByTestId('source-save').click();

  const link = sourceBox(page).getByTestId('piece-source-link');
  await expect(link).toHaveText(strings.find.fromSite('MuseScore'));
  await expect(link).toHaveAttribute('href', 'https://musescore.com/user/123/scores/456');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noreferrer');
  const rating = ratingLine({ stars: 4.8, ratings: 120, views: 15_000, notedOn: today() });
  await expect(sourceBox(page).getByTestId('piece-source-rating')).toHaveText(rating);

  await page.reload();
  await expect(sourceBox(page).getByTestId('piece-source-link')).toHaveAttribute(
    'href',
    'https://musescore.com/user/123/scores/456',
  );
  await expect(sourceBox(page).getByTestId('piece-source-rating')).toHaveText(rating);

  const json = await eventuallyInRemote(`pieces/${id}/piece.json`, (t) => t.includes('musescore'));
  expect(JSON.parse(json)).toMatchObject({
    title: 'The Lonely Waltz',
    source: {
      name: 'MuseScore',
      url: 'https://musescore.com/user/123/scores/456',
      rating: { stars: 4.8, ratings: 120, views: 15_000, notedOn: today() },
    },
  });
  await expect
    .poll(() => remoteLog('%B').join('\n'))
    .toContain("Source for 'The Lonely Waltz': MuseScore ⭐ 4.8");

  await openLibrary(page);
  const card = page.getByTestId('piece-card').filter({ hasText: 'The Lonely Waltz' });
  await expect(card.getByTestId('piece-card-stars')).toHaveText('⭐ 4.8');
});

test('the link and rating can be changed, and removed again', async ({ page }) => {
  const id = await createPiece(page, 'Gran Vals', { pdf: false });
  await page.getByTestId('piece-source-add').click();
  const form = page.getByTestId('source-form');
  await fillSource(form, { url: 'https://www.youtube.com/watch?v=abc123' });
  await form.getByTestId('source-save').click();
  await expect(sourceBox(page).getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('youtube.com'),
  );
  await expect(sourceBox(page).getByTestId('piece-source-rating')).toHaveCount(0);

  await sourceBox(page).getByTestId('piece-source-edit').click();
  await expect(form.getByTestId('source-url')).toHaveValue(
    'https://www.youtube.com/watch?v=abc123',
  );
  await fillSource(form, { url: 'https://imslp.org/wiki/Gran_Vals', views: '1.2M' });
  await form.getByTestId('source-save').click();
  await expect(sourceBox(page).getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('IMSLP'),
  );
  await expect(sourceBox(page).getByTestId('piece-source-rating')).toHaveText(
    ratingLine({ stars: null, ratings: null, views: 1_200_000, notedOn: today() }),
  );

  await sourceBox(page).getByTestId('piece-source-edit').click();
  page.once('dialog', (d) => void d.accept());
  await form.getByTestId('source-remove').click();
  await expect(sourceBox(page)).toHaveCount(0);
  await expect(page.getByTestId('piece-source-add')).toBeVisible();
  const json = await eventuallyInRemote(`pieces/${id}/piece.json`, (t) => !t.includes('imslp'));
  expect(JSON.parse(json)).not.toHaveProperty('source');
  await expect.poll(() => remoteLog('%B').join('\n')).toContain("Remove the source of 'Gran Vals'");
});

test('one file can name its own source: the PDF from IMSLP and the piece from MuseScore, each kept and removable', async ({
  page,
}) => {
  await createPiece(page, 'Gran Vals');
  await page.getByTestId('upload-music').setInputFiles({
    name: 'Gran Vals.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
  });
  await expect(page.getByTestId('playalong-canvas')).toBeVisible();
  const fileRows = page.getByTestId('file-source');

  await page.getByTestId('piece-source-add').click();
  const form = page.getByTestId('source-form');
  await form
    .getByTestId('source-for')
    .selectOption({ label: strings.source.forFile.scores('Gran Vals') });
  await fillSource(form, { url: 'imslp.org/wiki/Gran_Vals', stars: '4.5' });
  await form.getByTestId('source-save').click();

  await expect(fileRows).toHaveCount(1);
  await expect(fileRows).toContainText(strings.source.fileLabel.scores('Gran Vals'));
  await expect(fileRows.getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('IMSLP'),
  );
  await expect(fileRows.getByTestId('piece-source-link')).toHaveAttribute(
    'href',
    'https://imslp.org/wiki/Gran_Vals',
  );
  await expect(page.getByTestId('piece-source-add')).toBeVisible();

  await page.getByTestId('piece-source-add').click();
  await expect(form.getByTestId('source-for')).toHaveValue('piece');
  await fillSource(form, { url: 'musescore.com/user/1/scores/2' });
  await form.getByTestId('source-save').click();
  await expect(sourceBox(page).getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('MuseScore'),
  );

  await page.reload();
  await expect(sourceBox(page).getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('MuseScore'),
  );
  await expect(fileRows.getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('IMSLP'),
  );

  await fileRows.getByTestId('piece-source-edit').click();
  await expect(form.getByTestId('source-url')).toHaveValue('https://imslp.org/wiki/Gran_Vals');
  page.once('dialog', (d) => void d.accept());
  await form.getByTestId('source-remove').click();
  await expect(fileRows).toHaveCount(0);
  await expect(sourceBox(page).getByTestId('piece-source-link')).toHaveText(
    strings.find.fromSite('MuseScore'),
  );
});
