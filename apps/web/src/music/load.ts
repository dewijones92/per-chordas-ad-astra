import { isZip } from '@pcaa/shared';
import { unzipSync } from 'fflate';
import type { ScoreModel } from './model.ts';
import { parseMscx } from './mscx.ts';
import { parseMusicXml } from './musicxml.ts';
import { child, parseXml } from './xml.ts';

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

export function rootFileOf(files: Readonly<Record<string, Uint8Array>>): string {
  const container = files['META-INF/container.xml'];
  if (container) {
    const doc = parseXml(decode(container));
    const rootfile = doc.getElementsByTagName('rootfile')[0];
    const path = rootfile?.getAttribute('full-path');
    if (path && files[path]) return path;
  }
  const guess = Object.keys(files).find(
    (name) => !name.startsWith('META-INF/') && /\.(mscx|musicxml|xml)$/i.test(name),
  );
  if (!guess) throw new Error('No score inside this archive');
  return guess;
}

export function unpackScore(bytes: Uint8Array): string {
  if (!isZip(bytes)) return decode(bytes);
  const files = unzipSync(bytes, {
    filter: (f) => f.name === 'META-INF/container.xml' || /\.(mscx|musicxml|xml)$/i.test(f.name),
  });
  const root = files[rootFileOf(files)];
  if (!root) throw new Error('No score inside this archive');
  return decode(root);
}

export function parseScoreText(source: string): ScoreModel {
  const doc = parseXml(source);
  const tag = doc.documentElement.tagName;
  if (tag === 'museScore') return parseMscx(doc);
  if (tag === 'score-partwise') return parseMusicXml(doc);
  if (tag === 'score-timewise') {
    throw new Error('Timewise MusicXML is not supported; export it as partwise MusicXML');
  }
  if (child(doc.documentElement, 'Score')) return parseMscx(doc);
  throw new Error(`Not a MuseScore or MusicXML file (found <${tag}>)`);
}

export function loadScore(bytes: Uint8Array): ScoreModel {
  return parseScoreText(unpackScore(bytes));
}
