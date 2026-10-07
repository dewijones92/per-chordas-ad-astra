import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { makePdf, makeToneWav } from '../../packages/fixtures/src/index.ts';
import { expect, type Page } from '@playwright/test';

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

export function remoteLog(): string[] {
  return execFileSync('git', ['--git-dir', remote, 'log', '--format=%s', 'main'], {
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

export const pdfFile = (title: string, pages = 3) => ({
  name: `${title}.pdf`,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    makePdf(Array.from({ length: pages }, (_, i) => `${title} page ${String(i + 1)}`)),
  ),
});

export const toneFile = (name: string, seconds = 8) => ({
  name,
  mimeType: 'audio/wav',
  buffer: Buffer.from(makeToneWav({ frequencyHz: 196, seconds })),
});

export async function openLibrary(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.boot')).toHaveCount(0);
  await page.locator('.nav').getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
}

export async function createPiece(
  page: Page,
  title: string,
  opts: { tags?: string; pdf?: boolean } = {},
): Promise<string> {
  await openLibrary(page);
  await page.getByTestId('new-piece').click();
  const dialog = page.getByTestId('new-piece-dialog');
  await dialog.locator('input[name="title"]').fill(title);
  if (opts.tags) await dialog.locator('input[name="tags"]').fill(opts.tags);
  if (opts.pdf !== false) await dialog.locator('input[name="score"]').setInputFiles(pdfFile(title));
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/piece\//);
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

export async function waitForGitHub(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-pill')).toHaveAttribute('data-tone', 'github', {
    timeout: 15_000,
  });
}
