import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { makePdf, makeToneWav, type FixtureMark } from '../../packages/fixtures/src/index.ts';
import { expect, type Page } from '@playwright/test';
import { strings } from '../../apps/web/src/strings.ts';

export const remote = join(import.meta.dirname, '..', '.tmp', 'run', 'remote.git');

export function remoteFile(path: string): string | null {
  try {
    return execFileSync('git', ['--git-dir', remote, 'show', `main:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

export function remoteLog(format = '%s'): string[] {
  return execFileSync('git', ['--git-dir', remote, 'log', `--format=${format}`, 'main'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
}

export async function eventuallyInRemote(
  path: string,
  predicate: (text: string) => boolean = () => true,
): Promise<string> {
  const seen = { text: '' };
  await expect
    .poll(
      () => {
        const text = remoteFile(path);
        if (text === null) return false;
        seen.text = text;
        return predicate(text);
      },
      { timeout: 15_000, message: `waiting for ${path} in the remote` },
    )
    .toBe(true);
  return seen.text;
}

export const pdfFile = (
  title: string,
  pages = 3,
  marks: readonly (readonly FixtureMark[])[] = [],
) => ({
  name: `${title}.pdf`,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    makePdf(
      Array.from({ length: pages }, (_, i) => `${title} page ${String(i + 1)}`),
      [595, 842],
      marks,
    ),
  ),
});

export const toneFile = (name: string, seconds = 8) => ({
  name,
  mimeType: 'audio/wav',
  buffer: Buffer.from(makeToneWav({ frequencyHz: 196, seconds })),
});

export async function learnKeySaved(page: Page, on: boolean): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get('/api/resume');
        const state = (await res.json()) as { learnKey?: { on: boolean } | null };
        return state.learnKey?.on ?? false;
      },
      { timeout: 15_000, message: `waiting for the server to hold learnKey ${String(on)}` },
    )
    .toBe(on);
}

export async function openLibrary(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.boot')).toHaveCount(0);
  const nav = page.locator('.nav').getByRole('link', { name: strings.nav.library, exact: true });
  const docked = page.getByTestId('dock-head').getByRole('link', { name: strings.piece.library });
  await expect(nav.or(docked).first()).toBeVisible();
  if (await docked.isVisible()) await docked.click();
  else await nav.click();
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
}

export async function createPiece(
  page: Page,
  title: string,
  opts: {
    tags?: string;
    pdf?: boolean;
    pages?: number;
    marks?: readonly (readonly FixtureMark[])[];
  } = {},
): Promise<string> {
  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  const dialog = page.getByTestId('new-piece-dialog');
  await dialog.locator('input[name="title"]').fill(title);
  if (opts.tags) await dialog.locator('input[name="tags"]').fill(opts.tags);
  if (opts.pdf !== false)
    await dialog
      .locator('input[name="score"]')
      .setInputFiles(pdfFile(title, opts.pages, opts.marks));
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/piece\//);
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

export async function waitForGitHub(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-pill')).toHaveAttribute('data-tone', 'github', {
    timeout: 15_000,
  });
}

export interface Voice {
  kind: 'osc' | 'noise';
  type: string;
  hz: number;
}

export const CLICK_PITCHES = [1760, 1175, 784];

export async function watchVoices(page: Page): Promise<() => Promise<Voice[]>> {
  await page.addInitScript(() => {
    const started: Voice[] = [];
    (window as unknown as { voices: Voice[] }).voices = started;
    const osc = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      started.push({ kind: 'osc', type: this.type, hz: Math.round(this.frequency.value) });
      osc.call(this, when);
    };
    const noise = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number) {
      started.push({ kind: 'noise', type: 'noise', hz: 0 });
      noise.call(this, when);
    };
  });
  return () => page.evaluate(() => (window as unknown as { voices: Voice[] }).voices.slice());
}

export async function clickBar(page: Page, index: number): Promise<void> {
  const strip = page.getByTestId('playalong-bars');
  const cell = Number(await strip.getAttribute('data-cell-width'));
  await strip.click({ position: { x: cell * (index + 0.5), y: 10 } });
  await expect(page.getByTestId('playalong-position')).toContainText(
    `📍 Bar ${String(index + 1)} ·`,
  );
}

export interface CountInLog {
  at: number;
  beats: number;
  seconds: number;
}

export function watchCountIns(page: Page): CountInLog[] {
  const seen: CountInLog[] = [];
  page.on('console', (msg) => {
    if (!msg.text().startsWith('dewidebug play-along count-in clicks')) return;
    void msg
      .args()[1]
      ?.jsonValue()
      .then((v: { at: string; beats: number; seconds: string }) => {
        seen.push({ at: Number(v.at), beats: v.beats, seconds: Number(v.seconds) });
      });
  });
  return seen;
}

export interface ClockSample {
  clock: number;
  position: number;
}

export async function sampleClock(
  page: Page,
  until: (samples: ClockSample[]) => boolean,
  limitMs = 15_000,
): Promise<ClockSample[]> {
  const samples: ClockSample[] = [];
  const started = Date.now();
  while (!until(samples) && Date.now() - started < limitMs) {
    samples.push(
      ...(await page.evaluate(async () => {
        const canvas = document.querySelector<HTMLElement>('[data-testid="playalong-canvas"]');
        const out: { clock: number; position: number }[] = [];
        for (let i = 0; i < 10; i++) {
          out.push({
            clock: Number(canvas?.dataset['clock'] ?? 'NaN'),
            position: Number(canvas?.dataset['position'] ?? 'NaN'),
          });
          await new Promise((r) => setTimeout(r, 30));
        }
        return out;
      })),
    );
  }
  return samples;
}
