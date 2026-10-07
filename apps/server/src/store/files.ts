import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { z } from 'zod';

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export class InvalidDataError extends Error {
  constructor(path: string, detail: string) {
    super(`${path} is not valid: ${detail}`);
    this.name = 'InvalidDataError';
  }
}

export function resolveInside(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const target = resolve(base, ...parts);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Refusing path outside the data directory: ${parts.join('/')}`);
  }
  return target;
}

function tempIn(tmpDir: string, suffix: string): string {
  return join(tmpDir, `${String(process.pid)}.${crypto.randomUUID()}.${suffix}`);
}

export async function atomicWrite(
  path: string,
  data: string | Uint8Array,
  tmpDir: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  const tmp = tempIn(tmpDir, 'tmp');
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export function stringifyForGit(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g,
    (_match, inner: string) => `[${inner.split(/,\s*/).join(', ')}]`,
  );
}

export async function writeJson(path: string, value: unknown, tmpDir: string): Promise<void> {
  await atomicWrite(path, `${stringifyForGit(value)}\n`, tmpDir);
}

export async function readJson<S extends z.ZodType>(
  path: string,
  schema: S,
  fallback?: () => z.output<S>,
): Promise<z.output<S>> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (fallback) return fallback();
      throw new NotFoundError(path);
    }
    throw error;
  }
  const parsed = schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new InvalidDataError(path, parsed.error.message);
  return parsed.data;
}

export type Upload = Blob | ReadableStream<Uint8Array>;

export interface UploadRules {
  maxBytes: number;
  tooLarge: () => Error;
  checkHead?: (head: Uint8Array) => Error | null;
}

export async function writeUpload(
  path: string,
  source: Upload,
  rules: UploadRules,
  tmpDir: string,
): Promise<number> {
  await mkdir(dirname(path), { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  const tmp = tempIn(tmpDir, 'upload');
  const stream = source instanceof Blob ? source.stream() : source;
  const out = await open(tmp, 'w');
  let written = 0;
  let head = new Uint8Array(0);
  try {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      written += chunk.byteLength;
      if (written > rules.maxBytes) throw rules.tooLarge();
      if (head.byteLength < 16) {
        const next = new Uint8Array(Math.min(16, head.byteLength + chunk.byteLength));
        next.set(head);
        next.set(chunk.subarray(0, next.byteLength - head.byteLength), head.byteLength);
        head = next;
      }
      await out.write(chunk);
    }
    await out.close();
    const problem = rules.checkHead?.(head) ?? null;
    if (problem) throw problem;
    await rename(tmp, path);
    return written;
  } catch (error) {
    await out.close().catch(() => undefined);
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}
