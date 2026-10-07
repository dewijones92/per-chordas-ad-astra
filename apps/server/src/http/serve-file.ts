import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Context } from 'hono';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

export function contentTypeFor(file: string): string {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[ext] ?? 'application/octet-stream';
}

export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return null;
  let start: number;
  let end: number;
  if (startText === '') {
    const suffix = Number(endText);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

export async function serveFile(c: Context, path: string, fileName: string): Promise<Response> {
  const { size } = await stat(path);
  const type = contentTypeFor(fileName);
  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-cache',
  });
  const rangeHeader = c.req.header('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      headers.set('Content-Range', `bytes */${String(size)}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set(
      'Content-Range',
      `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
    );
    headers.set('Content-Length', String(range.end - range.start + 1));
    const stream = Readable.toWeb(createReadStream(path, range)) as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: 200, headers });
}
