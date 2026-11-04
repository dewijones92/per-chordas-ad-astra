import { makeMusicXml, PIANO_WALTZ, type FixtureScore } from '../packages/fixtures/src/index.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createPiece } from './support/helpers.ts';
import { strings, tips } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

const SCALE: FixtureScore = {
  title: 'Fixture Scale',
  tempo: 60,
  time: [3, 4],
  fifths: 0,
  parts: [{ name: 'Piano', staves: 2 }],
  measures: [
    {
      staves: [
        [60, 62, 64].map((p) => ({ pitches: [p], dur: 'quarter' as const })),
        [{ pitches: [48], dur: 'half' as const, dots: 1 }],
      ],
    },
    {
      staves: [
        [65, 67, 69].map((p) => ({ pitches: [p], dur: 'quarter' as const })),
        [{ pitches: [48], dur: 'half' as const, dots: 1 }],
      ],
    },
    {
      staves: [
        [71, 72].map((p) => ({ pitches: [p], dur: 'quarter' as const })),
        [{ pitches: [48], dur: 'half' as const, dots: 1 }],
      ],
    },
  ],
};

const scaleXml = () => ({
  name: 'Fixture Scale.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(SCALE)),
});

interface Tip {
  finger: number;
  x: number;
  down: boolean;
}
interface Hand {
  side: 'right' | 'left';
  tips: Tip[];
}

const handsOf = async (canvas: Locator): Promise<Hand[]> => {
  const raw = await canvas.getAttribute('data-hands');
  return raw ? (JSON.parse(raw) as Hand[]) : [];
};

async function keyX(canvas: Locator, pitch: number): Promise<number> {
  const blocks = (await canvas.getAttribute('data-blocks')) ?? '';
  const hit = blocks
    .split(' ')
    .map((b) => b.split(':').map(Number))
    .find(([p]) => p === pitch);
  if (!hit) throw new Error(`no block for ${String(pitch)} in "${blocks}"`);
  return hit[1] ?? 0;
}

async function atBar(page: Page, bar: number): Promise<void> {
  const canvas = page.getByTestId('playalong-canvas');
  await page.getByRole('button', { name: tips.playAlong.toStart }).click();
  for (let i = 1; i < bar; i++)
    await page.getByRole('button', { name: tips.playAlong.nextBar }).click();
  await expect(canvas).toHaveAttribute('data-position', `${String((bar - 1) * 3)}.000`);
}

async function pressing(canvas: Locator, side: Hand['side']) {
  const hand = (await handsOf(canvas)).find((h) => h.side === side);
  return {
    fingers: hand?.tips.filter((t) => t.down).map((t) => t.finger) ?? [],
    tips: hand?.tips ?? [],
  };
}

async function overKey(canvas: Locator, side: Hand['side'], finger: number, pitch: number) {
  await expect
    .poll(async () => {
      const { fingers, tips } = await pressing(canvas, side);
      const tip = tips.find((t) => t.finger === finger);
      return JSON.stringify([
        fingers,
        tip ? Math.abs(tip.x - (await keyX(canvas, pitch))) <= 1 : null,
      ]);
    })
    .toBe(JSON.stringify([[finger], true]));
}

test('hands play the scale over the keyboard: the right finger is down over the right key at each place', async ({
  page,
}) => {
  await createPiece(page, 'Scale Hands', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(scaleXml());
  const canvas = page.getByTestId('playalong-canvas');
  await expect(canvas).toHaveAttribute('data-blocks', /60:/);

  await atBar(page, 1);
  await overKey(canvas, 'right', 1, 60);
  const xs = (await pressing(canvas, 'right')).tips.map((t) => t.x);
  expect(xs).toHaveLength(5);
  expect(xs).toEqual([...xs].sort((a, b) => a - b));

  await atBar(page, 2);
  await overKey(canvas, 'right', 1, 65);
  const next = (await pressing(canvas, 'right')).tips.map((t) => t.x);
  expect(next).toEqual([...next].sort((a, b) => a - b));
  expect(next[0]).toBeGreaterThan(xs[2] ?? 0);

  await atBar(page, 3);
  await overKey(canvas, 'right', 4, 71);

  const left = await pressing(canvas, 'left');
  expect(left.fingers).toHaveLength(1);
  const leftXs = left.tips.map((t) => t.x);
  expect(leftXs).toEqual([...leftXs].sort((a, b) => b - a));
});

test('Show hands is on to start with, has hover text, can be switched off, is remembered, and is only for piano', async ({
  page,
}) => {
  await createPiece(page, 'Hands Tick', { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  const canvas = page.getByTestId('playalong-canvas');
  const box = page.getByTestId('playalong-hands');
  await expect(canvas).toHaveAttribute('data-blocks', /71:/);
  await expect(box).toBeChecked();
  await expect(page.locator('label', { has: box })).toContainText(strings.playAlong.showHands);
  await expect(page.locator('label', { has: box })).toHaveAttribute(
    'title',
    tips.playAlong.showHands,
  );

  await expect
    .poll(async () => (await handsOf(canvas)).map((h) => h.side))
    .toEqual(['right', 'left']);
  const right = (await handsOf(canvas)).find((h) => h.side === 'right');
  const pressing = right?.tips.find((t) => t.down);
  expect(pressing).toBeDefined();
  expect(Math.abs((pressing?.x ?? -99) - (await keyX(canvas, 71)))).toBeLessThanOrEqual(1);

  await box.uncheck();
  await expect(canvas).toHaveAttribute('data-hands', '[]');
  await page.reload();
  await expect(page.getByTestId('playalong-hands')).not.toBeChecked();
  await expect(page.getByTestId('playalong-canvas')).toHaveAttribute('data-hands', '[]');

  await page.getByTestId('playalong-hands').check();
  await expect
    .poll(async () => (await handsOf(page.getByTestId('playalong-canvas'))).length)
    .toBe(2);

  await page
    .getByTestId('playalong-play-on')
    .getByRole('button', { name: strings.playAlong.playOnModes.guitar })
    .click();
  await expect(page.getByTestId('playalong-hands')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-hands', '[]');
});
