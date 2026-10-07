import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
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

export async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${String(process.pid)}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
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
