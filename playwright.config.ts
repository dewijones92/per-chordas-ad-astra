import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { makeToneWav } from './packages/fixtures/src/index.ts';

const tmp = join(import.meta.dirname, 'e2e', '.tmp');
mkdirSync(tmp, { recursive: true });
const fakeMic = join(tmp, 'mic-a2-110hz.wav');
writeFileSync(fakeMic, makeToneWav({ frequencyHz: 110, seconds: 4 }));

const silentAudioEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
  PULSE_SERVER: 'unix:/nonexistent/per-chordas-ad-astra-e2e-is-silent',
};

const port = 8799;
const executablePath = process.env['PW_CHROMIUM_PATH'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['microphone'],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          env: silentAudioEnv,
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeMic}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `node e2e/support/start-server.mjs ${String(port)}`,
    url: `http://127.0.0.1:${String(port)}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
