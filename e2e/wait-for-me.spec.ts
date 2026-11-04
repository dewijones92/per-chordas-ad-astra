import { makeMusicXml, PIANO_WALTZ } from '../packages/fixtures/src/index.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createPiece, watchVoices } from './support/helpers.ts';
import { fakeMidi, installFakeMidi, type FakeMidiOptions } from './support/fake-midi.ts';
import { strings } from '../apps/web/src/strings.ts';

const waltzXml = () => ({
  name: 'Fixture Waltz.musicxml',
  mimeType: 'application/xml',
  buffer: Buffer.from(makeMusicXml(PIANO_WALTZ)),
});

const KB = 'kb1';
const panel = (page: Page) => page.getByTestId('wait-panel');
const canvas = (page: Page) => page.getByTestId('playalong-canvas');
const number = async (locator: Locator, attribute: string) =>
  Number(await locator.getAttribute(attribute));
const pitchesOf = async (locator: Locator, attribute: string) =>
  ((await locator.getAttribute(attribute)) ?? '').split(' ').filter(Boolean).map(Number);

async function open(
  page: Page,
  title: string,
  midi: FakeMidiOptions = { mode: 'allowed', devices: [{ id: KB, name: 'Fake Piano' }] },
  collapse = true,
): Promise<void> {
  await installFakeMidi(page, midi);
  await createPiece(page, title, { pdf: false });
  await page.getByTestId('upload-music').setInputFiles(waltzXml());
  await expect(canvas(page)).toBeVisible();
  await page.getByTestId('playalong-countin').uncheck();
  if (!collapse) return;
  await page.getByTestId('playalong-compact').click();
  await expect(canvas(page)).toBeInViewport();
}

async function turnOn(page: Page): Promise<void> {
  await page.getByTestId('playalong-wait').click();
  await expect(page.getByTestId('playalong-wait')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toBeVisible();
}

async function start(page: Page): Promise<void> {
  await page.getByTestId('playalong-play').click();
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
}

async function waitingAt(page: Page): Promise<number[]> {
  await expect(panel(page)).toHaveAttribute('data-waiting', 'true', { timeout: 10_000 });
  return pitchesOf(panel(page), 'data-expected');
}

async function playTarget(page: Page, play: (pitches: number[]) => Promise<void>): Promise<number> {
  const before = await number(panel(page), 'data-notes');
  const pitches = await waitingAt(page);
  expect(pitches.length).toBeGreaterThan(0);
  await play(pitches);
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(before + pitches.length);
  return pitches.length;
}

async function playToTheEnd(
  page: Page,
  play: (pitches: number[]) => Promise<void>,
): Promise<number> {
  let total = 0;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if ((await panel(page).getAttribute('data-finished')) === 'true') return total;
    if ((await panel(page).getAttribute('data-waiting')) === 'true') {
      total += await playTarget(page, play);
    } else {
      await page.waitForTimeout(100);
    }
  }
  throw new Error('the piece never finished');
}

const midiChord = (page: Page) => async (pitches: number[]) => {
  const midi = fakeMidi(page);
  for (const p of pitches) await midi.noteOn(KB, p);
  for (const p of pitches) await midi.noteOff(KB, p);
};

test('the notes stop at each note or chord until it is played on a MIDI keyboard, and a result follows', async ({
  page,
}) => {
  await open(page, 'Wait Etude');
  await turnOn(page);
  await expect(page.getByTestId('wait-midi')).toHaveText(
    strings.playAlong.wait.midiDevices('Fake Piano'),
  );
  await expect(page.getByTestId('wait-now')).toHaveText(strings.playAlong.wait.ready);
  const midi = fakeMidi(page);
  expect(await midi.requests()).toBe(1);

  await start(page);
  expect(await waitingAt(page)).toEqual([43, 71]);
  await expect(canvas(page)).toHaveAttribute('data-expected', '43 71');
  const stopped = await number(canvas(page), 'data-position');
  expect(stopped).toBe(0);
  await page.waitForTimeout(700);
  expect(await number(canvas(page), 'data-position')).toBe(stopped);
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');

  await midi.noteOn(KB, 43);
  await expect(panel(page)).toHaveAttribute('data-expected', '71');
  await expect(canvas(page)).toHaveAttribute('data-played', '43');
  await midi.noteOn(KB, 50);
  await expect(panel(page)).toHaveAttribute('data-wrong', '1');
  await expect(panel(page)).toHaveAttribute('data-waiting', 'true');
  expect(await number(canvas(page), 'data-position')).toBe(stopped);
  await midi.noteOff(KB, 50);
  await midi.noteOn(KB, 71);
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(2);
  await midi.noteOff(KB, 43);
  await midi.noteOff(KB, 71);

  await expect
    .poll(() => number(canvas(page), 'data-position'), { timeout: 5000 })
    .toBeGreaterThan(0.2);
  const answered = 2 + (await playToTheEnd(page, midiChord(page)));

  await expect(panel(page)).toHaveAttribute('data-finished', 'true');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
  const result = page.getByTestId('wait-result');
  await expect(result).toHaveAttribute('data-finished', 'true');
  await expect(page.getByTestId('wait-result-right')).toHaveText(
    strings.playAlong.wait.rightFirstTime(answered - 2, answered),
  );
  await expect(page.getByTestId('wait-result-wrong')).toHaveText(
    strings.playAlong.wait.wrongNotes(1),
  );
  await expect(page.getByTestId('wait-result-waited')).toContainText('⏳ Waited');
  await expect(canvas(page)).toHaveAttribute('data-expected', '');
});

test('the keys you press sound once each, and the app does not play your notes for you', async ({
  page,
}) => {
  const voices = await watchVoices(page);
  await open(page, 'Sounding Keys');
  await turnOn(page);
  await start(page);
  await waitingAt(page);
  await page.waitForTimeout(500);
  const before = (await voices()).length;
  const midi = fakeMidi(page);
  await midi.noteOn(KB, 43);
  await expect.poll(async () => (await voices()).length).toBe(before + 1);
  await midi.noteOn(KB, 71);
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(2);
  await page.waitForTimeout(300);
  expect((await voices()).length).toBe(before + 2);
  expect(await number(canvas(page), 'data-position')).toBeLessThanOrEqual(0.5);
});

test('a wrong key is counted and does not move on, and a later right one does', async ({
  page,
}) => {
  await open(page, 'Wrong Notes');
  await turnOn(page);
  await start(page);
  const midi = fakeMidi(page);
  await waitingAt(page);
  for (const wrong of [60, 61, 62]) {
    await midi.noteOn(KB, wrong);
    await midi.noteOff(KB, wrong);
  }
  await expect(panel(page)).toHaveAttribute('data-wrong', '3');
  await expect(panel(page)).toHaveAttribute('data-expected', '43 71');
  await expect(panel(page)).toHaveAttribute('data-notes', '0');
  expect(await number(canvas(page), 'data-position')).toBe(0);
  const anyWait = strings.playAlong.wait
    .live(0, 0, 3, 999)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('999', '\\d+');
  await expect(page.getByTestId('wait-live')).toHaveText(new RegExp(`^${anyWait}$`));
});

test('a chord can be played in any order, and keys held down still count', async ({ page }) => {
  await open(page, 'Chord Order');
  await turnOn(page);
  await start(page);
  const midi = fakeMidi(page);
  expect(await waitingAt(page)).toEqual([43, 71]);
  await midi.noteOn(KB, 71);
  await midi.noteOn(KB, 43);
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(2);
  await midi.noteOff(KB, 71);
  await midi.noteOff(KB, 43);
  expect(await waitingAt(page)).toEqual([59, 62, 67]);
  await midi.noteOn(KB, 67);
  await page.waitForTimeout(500);
  await midi.noteOn(KB, 62);
  await midi.noteOn(KB, 59);
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(5);
});

test('a keyboard plugged in while playing is picked up, and one unplugged is let go', async ({
  page,
}) => {
  await open(page, 'Hot Plug', { mode: 'allowed', devices: [] });
  await turnOn(page);
  await expect(page.getByTestId('wait-midi')).toHaveText(strings.playAlong.wait.midiNone);
  await start(page);
  await waitingAt(page);
  const midi = fakeMidi(page);
  expect(await midi.noteOn('late', 43)).toBe(false);
  await midi.plug('late', 'Late Piano');
  await expect(page.getByTestId('wait-midi')).toHaveText(
    strings.playAlong.wait.midiDevices('Late Piano'),
  );
  await playTarget(page, async (pitches) => {
    for (const p of pitches) await midi.noteOn('late', p);
  });
  await midi.unplug('late');
  await expect(page.getByTestId('wait-midi')).toHaveText(strings.playAlong.wait.midiNone);
  expect(await midi.noteOn('late', 43)).toBe(false);
});

test('when MIDI is refused it says so, and the on-screen keys still play', async ({ page }) => {
  await open(page, 'Denied Midi', { mode: 'denied' });
  await turnOn(page);
  await expect(page.getByTestId('wait-midi')).toHaveText(strings.playAlong.wait.midiDenied);
  await expect(panel(page)).toHaveAttribute('data-midi', 'denied');
  await start(page);
  await playTarget(page, (pitches) => clickKeys(page, pitches));
});

test('when the browser has no MIDI it says so, and the computer keys still play', async ({
  page,
}) => {
  await open(page, 'No Midi', { mode: 'unsupported' });
  await turnOn(page);
  await expect(page.getByTestId('wait-midi')).toHaveText(strings.playAlong.wait.midiUnsupported);
  await expect(panel(page)).toHaveAttribute('data-midi', 'unsupported');
  await start(page);
  await playTarget(page, async () => {
    await page.keyboard.press('KeyZ');
    await page.keyboard.press('KeyZ');
    await expect(panel(page)).toHaveAttribute('data-base', '36');
    await page.keyboard.down('KeyG');
    await page.keyboard.press('KeyX');
    await page.keyboard.press('KeyX');
    await expect(panel(page)).toHaveAttribute('data-base', '60');
    await page.keyboard.press('KeyJ');
    await page.keyboard.up('KeyG');
  });
});

async function clickKeys(page: Page, pitches: number[]): Promise<void> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  const targets = new Map(
    ((await canvas(page).getAttribute('data-keys')) ?? '')
      .split(' ')
      .map((k) => k.split(':').map(Number))
      .map(([p, x, y]) => [p, { x: x ?? 0, y: y ?? 0 }] as const),
  );
  for (const pitch of pitches) {
    const at = targets.get(pitch);
    if (!at) throw new Error(`no on-screen key for ${String(pitch)}`);
    await page.mouse.click(box.x + at.x, box.y + at.y);
  }
}

test('clicking the on-screen keys plays them, shows them pressed, and advances', async ({
  page,
}) => {
  await open(page, 'Screen Keys');
  await turnOn(page);
  await start(page);
  expect(await waitingAt(page)).toEqual([43, 71]);

  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  const keys = ((await canvas(page).getAttribute('data-keys')) ?? '')
    .split(' ')
    .map((k) => k.split(':').map(Number));
  const at = (pitch: number) => {
    const found = keys.find(([p]) => p === pitch);
    if (!found) throw new Error(`no key ${String(pitch)}`);
    return { x: box.x + (found[1] ?? 0), y: box.y + (found[2] ?? 0) };
  };
  await page.mouse.move(at(43).x, at(43).y);
  await page.mouse.down();
  await expect(canvas(page)).toHaveAttribute('data-played', '43');
  await expect(panel(page)).toHaveAttribute('data-expected', '71');
  await page.mouse.up();
  await expect(canvas(page)).toHaveAttribute('data-played', '');
  await page.mouse.click(at(71).x, at(71).y);
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(2);

  await playTarget(page, (pitches) => clickKeys(page, pitches));
  await playTarget(page, (pitches) => clickKeys(page, pitches));
});

test('the computer keyboard plays, moves octave with Z and X, and leaves Space, K and M alone', async ({
  page,
}) => {
  await open(page, 'Computer Keys');
  await turnOn(page);
  await expect(panel(page)).toHaveAttribute('data-base', '60');
  await start(page);
  expect(await waitingAt(page)).toEqual([43, 71]);

  await page.keyboard.down('KeyG');
  await expect(panel(page)).toHaveAttribute('data-played', '67');
  await page.keyboard.up('KeyG');
  await expect(panel(page)).toHaveAttribute('data-wrong', '1');

  await page.keyboard.press('KeyZ');
  await page.keyboard.press('KeyZ');
  await expect(panel(page)).toHaveAttribute('data-base', '36');
  await page.keyboard.down('KeyG');
  await expect(panel(page)).toHaveAttribute('data-expected', '71');
  await page.keyboard.press('KeyX');
  await page.keyboard.press('KeyX');
  await expect(panel(page)).toHaveAttribute('data-base', '60');
  await page.keyboard.press('KeyJ');
  await page.keyboard.up('KeyG');
  await expect.poll(() => number(panel(page), 'data-notes')).toBe(2);

  await page.keyboard.press('KeyK');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
  await expect(panel(page)).toHaveAttribute('data-played', '');
});

test('while drawing, the drawing-tool letters pick tools and play no piano notes', async ({
  page,
}) => {
  await open(page, 'Draw Keys', undefined, false);
  await turnOn(page);
  await page.getByTestId('notation-draw').click();
  await expect(page.locator('.playalong [data-tool="pen"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const [key, tool] of [
    ['KeyH', 'highlighter'],
    ['KeyE', 'eraser'],
    ['KeyT', 'text'],
    ['KeyA', 'arrow'],
    ['KeyS', 'stamp'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(page.locator(`.playalong [data-tool="${tool}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(panel(page)).toHaveAttribute('data-played', '');
  }

  await page.getByTestId('notation-draw-done').click();
  await page.keyboard.down('KeyH');
  await expect(panel(page)).toHaveAttribute('data-played', '69');
  await page.keyboard.up('KeyH');
});

test('pausing shows how it went so far, and Start again begins afresh', async ({ page }) => {
  await open(page, 'Pause Result');
  await turnOn(page);
  await start(page);
  const midi = fakeMidi(page);
  await waitingAt(page);
  await midi.noteOn(KB, 61);
  await midi.noteOff(KB, 61);
  await playTarget(page, midiChord(page));
  await waitingAt(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('playalong-play')).toHaveAttribute('aria-pressed', 'false');
  const result = page.getByTestId('wait-result');
  await expect(result).toHaveAttribute('data-finished', 'false');
  await expect(page.getByTestId('wait-result-right')).toHaveText(
    strings.playAlong.wait.rightFirstTime(0, 2),
  );
  await expect(page.getByTestId('wait-result-wrong')).toHaveText(
    strings.playAlong.wait.wrongNotes(1),
  );

  await page.keyboard.press('Space');
  await expect(result).toHaveCount(0);
  await expect(panel(page)).toHaveAttribute('data-waiting', 'true');
  await page.keyboard.press('Space');
  await page.getByTestId('wait-again').click();
  await expect(panel(page)).toHaveAttribute('data-notes', '0');
  await expect(panel(page)).toHaveAttribute('data-wrong', '0');
  await expect(result).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-position', '0.000');
});

test('the count-in plays first, and a loop starts over at its start', async ({ page }) => {
  await open(page, 'Loop Wait', undefined, false);
  await page.getByRole('button', { name: 'From here' }).click();
  await page.getByRole('button', { name: 'To here' }).click();
  await expect(page.getByTestId('playalong-loop')).toContainText('Bars 1–1');
  await page.getByTestId('playalong-countin').check();
  await turnOn(page);
  await start(page);
  await page.waitForTimeout(400);
  await expect(panel(page)).toHaveAttribute('data-waiting', 'false');
  expect(await waitingAt(page)).toEqual([43, 71]);

  let notes = 0;
  for (let i = 0; i < 3; i++) notes += await playTarget(page, midiChord(page));
  expect(notes).toBe(7);
  await expect
    .poll(() => number(canvas(page), 'data-position'), { timeout: 5000 })
    .toBeLessThan(0.1);
  expect(await waitingAt(page)).toEqual([43, 71]);
  expect(await number(canvas(page), 'data-position')).toBe(0);
  await playTarget(page, midiChord(page));
  await expect(panel(page)).toHaveAttribute('data-notes', '9');
  await expect(panel(page)).toHaveAttribute('data-finished', 'false');
});

test('only the notes you play are waited for: a muted hand is yours, a hidden hand is left to the app, and transposing moves the keys', async ({
  page,
}) => {
  await open(page, 'Whose Notes', undefined, false);
  await page.getByRole('button', { name: 'Mute Piano LH' }).click();
  await turnOn(page);
  await start(page);
  expect(await waitingAt(page)).toEqual([43]);
  await page.getByTestId('playalong-play').click();

  await page.getByRole('button', { name: 'Unmute Piano LH' }).click();
  await page.getByRole('button', { name: 'Hide Piano LH' }).click();
  await start(page);
  expect(await waitingAt(page)).toEqual([71]);
  await page.getByTestId('playalong-play').click();

  await page.getByRole('button', { name: 'Show Piano LH' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await page.getByRole('button', { name: 'Transpose up a semitone' }).click();
  await start(page);
  expect(await waitingAt(page)).toEqual([45, 73]);
});

test('Wait for me is remembered, and switching it off lets the music run', async ({ page }) => {
  await open(page, 'Remember Wait');
  await turnOn(page);
  await page.reload();
  await expect(page.getByTestId('playalong-wait')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toBeVisible();
  await start(page);
  await waitingAt(page);
  await page.getByTestId('playalong-wait').click();
  await expect(panel(page)).toHaveCount(0);
  await expect
    .poll(() => number(canvas(page), 'data-position'), { timeout: 5000 })
    .toBeGreaterThan(0.3);
});
