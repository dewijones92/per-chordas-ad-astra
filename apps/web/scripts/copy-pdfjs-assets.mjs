import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pdfjs = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const target = join(here, '..', 'public', 'pdfjs');

rmSync(target, { recursive: true, force: true });
for (const dir of ['wasm', 'standard_fonts', 'cmaps', 'iccs']) {
  cpSync(join(pdfjs, dir), join(target, dir), { recursive: true });
}
console.info(`copied pdf.js assets to ${target}`);
