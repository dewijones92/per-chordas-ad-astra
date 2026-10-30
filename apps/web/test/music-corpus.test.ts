import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScore, parseScoreText, unpackScore } from '../src/music/load.ts';
import { unroll } from '../src/music/unroll.ts';
import { buildPerformance } from '../src/music/performance.ts';
import { toMusicXml, tpcOf } from '../src/music/to-musicxml.ts';
import { transposeMusicXml } from '../src/music/export.ts';
import { transposeFifths } from '../src/music/keys.ts';
import { assignHands } from '../src/music/hands.ts';
import { grandStaff, scoreHands } from '../src/music/grand-staff.ts';

const corpus = process.env['MUSIC_CORPUS'];
const KNOWN_DIFFERENCES = new Set(['repeat52.mscx', 'repeat53.mscx']);
const CROSS_STAFF_TIES: Readonly<Record<string, number>> = { 'goldberg.mscz': 3 };

describe.skipIf(!corpus)('real-world corpus (MUSIC_CORPUS)', () => {
  const dir = corpus ?? '';
  const oracleDir = join(dir, 'repeat');
  const oracle = new Map<string, string>();
  try {
    const source = readFileSync(join(oracleDir, 'repeat_tests.cpp'), 'utf8');
    for (const m of source.matchAll(/repeat\("(repeat\d+\.mscx)",\s*u"([^"]*)"\)/g)) {
      oracle.set(m[1] ?? '', (m[2] ?? '').replace(/\s/g, ''));
    }
  } catch {
    oracle.clear();
  }

  const playedBars = (name: string) => {
    const score = loadScore(readFileSync(join(oracleDir, name)));
    return unroll(score.measures, score.voltas)
      .order.map((i) => score.measures[i]?.number ?? -1)
      .join(';');
  };
  const names = [...oracle.keys()];
  it.each(names.filter((n) => !KNOWN_DIFFERENCES.has(n)))(
    '%s plays bars in MuseScore order',
    (name) => {
      expect(playedBars(name)).toBe(oracle.get(name));
    },
  );
  it.fails.each(names.filter((n) => KNOWN_DIFFERENCES.has(n)))(
    '%s (jump into an ending with repeats) still differs from MuseScore',
    (name) => {
      expect(playedBars(name)).toBe(oracle.get(name));
    },
  );

  const files = (() => {
    try {
      return readdirSync(join(dir, 'dl')).filter((f) => /\.(mscz|mscx|mxl|musicxml)$/.test(f));
    } catch {
      return [];
    }
  })();
  it.each(files.filter((f) => /\.msc[zx]$/.test(f)))(
    '%s converts to MusicXML that plays the same',
    (name) => {
      const score = loadScore(readFileSync(join(dir, 'dl', name)));
      if (!score.notation) throw new Error('no notation');
      const back = buildPerformance(parseScoreText(toMusicXml(score, score.notation)));
      const direct = buildPerformance(score);
      const shape = (p: typeof direct) => ({
        bars: p.bars.map((b) => b.number).join(','),
        notes: p.notes
          .filter((n) => !n.grace)
          .map(
            (n) =>
              `${String(n.staff)}:${String(n.pitch)}@${n.start.toFixed(3)}-${n.end.toFixed(3)}`,
          ),
        graces: p.notes
          .filter((n) => n.grace)
          .map((n) => `${String(n.staff)}:${String(n.pitch)}`)
          .sort(),
      });
      expect(shape(back)).toEqual(shape(direct));
    },
  );

  it.each(files.filter((f) => /\.msc[zx]$/.test(f)))(
    '%s redrawn by hand as a grand staff keeps every note, two staves, and never crosses the hands',
    (name) => {
      const score = loadScore(readFileSync(join(dir, 'dl', name)));
      const direct = buildPerformance(score);
      const hands = assignHands(direct.notes);
      const grand = grandStaff(score, scoreHands(score.notes, hands));
      if (!grand.notation) throw new Error('no notation');
      const back = buildPerformance(parseScoreText(toMusicXml(grand, grand.notation)));
      const notes = (p: typeof direct) =>
        p.notes
          .filter((n) => !n.grace)
          .map((n) => `${String(n.pitch)}@${n.start.toFixed(3)}`)
          .sort();
      expect(back.staves).toHaveLength(2);
      const counts = new Map<string, number>();
      for (const k of notes(direct)) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const k of notes(back)) counts.set(k, (counts.get(k) ?? 0) - 1);
      const differing = [...counts]
        .filter(([, c]) => c !== 0)
        .reduce((a, [, c]) => a + Math.abs(c), 0);
      expect(differing).toBe(CROSS_STAFF_TIES[name] ?? 0);
      const byStart = new Map<string, { left: number; right: number }>();
      for (const n of direct.notes) {
        const at = n.start.toFixed(2);
        const seen = byStart.get(at) ?? { left: -Infinity, right: Infinity };
        if (hands.get(n) === 'left') seen.left = Math.max(seen.left, n.pitch);
        else seen.right = Math.min(seen.right, n.pitch);
        byStart.set(at, seen);
      }
      const crossed = [...byStart].filter(([, s]) => s.left >= s.right).map(([at]) => at);
      expect(crossed).toEqual([]);
    },
  );

  it.each(files)(
    '%s exports transposed with every note moved and the key moved with it',
    (name) => {
      const score = loadScore(readFileSync(join(dir, 'dl', name)));
      const xml =
        score.format === 'musicxml'
          ? unpackScore(readFileSync(join(dir, 'dl', name)))
          : score.notation
            ? toMusicXml(score, score.notation)
            : null;
      if (!xml) throw new Error('no notation');
      const before = buildPerformance(parseScoreText(xml));
      for (const semitones of [3, -5, 1, -1]) {
        const after = buildPerformance(
          parseScoreText(transposeMusicXml(xml, semitones, before.keyFifths)),
        );
        expect(after.keyFifths).toBe(transposeFifths(before.keyFifths, semitones));
        const spelling = (text: string) => {
          const doc = new DOMParser().parseFromString(text, 'application/xml');
          const out: number[] = [];
          for (const part of Array.from(doc.getElementsByTagName('part'))) {
            let key = before.keyFifths;
            for (const el of Array.from(part.getElementsByTagName('*'))) {
              const text = (name: string) => el.getElementsByTagName(name)[0]?.textContent ?? '';
              if (el.tagName === 'key' && text('fifths') !== '') key = Number(text('fifths'));
              if (el.tagName === 'pitch')
                out.push(tpcOf(text('step'), Number(text('alter') || 0)) - key);
            }
          }
          return out;
        };
        const moved = transposeMusicXml(xml, semitones, before.keyFifths);
        expect(
          [...moved.matchAll(/<fifths>(-?\d+)<\/fifths>/g)].every(
            (m) => Math.abs(Number(m[1])) <= 7,
          ),
        ).toBe(true);
        expect(spelling(moved)).toEqual(spelling(xml));
        expect(after.notes.map((n) => n.pitch)).toEqual(
          before.notes.map((n) => n.pitch + semitones),
        );
      }
    },
    60_000,
  );

  it.each(files)(
    '%s parses into notes',
    (name) => {
      const bytes = readFileSync(join(dir, 'dl', name));
      const text = unpackScore(bytes);
      const score = parseScoreText(text);
      const written =
        score.format === 'musescore'
          ? [
              ...text
                .slice(text.indexOf('<Score>') + '<Score>'.length)
                .replace(/<Score>[\s\S]*?<\/Score>/g, '')
                .matchAll(/<Note>([\s\S]*?)<\/Note>/g),
            ].filter((m) => !(m[1] ?? '').includes('<play>0</play>')).length
          : [...text.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/g)].filter(
              (m) => (m[1] ?? '').includes('<pitch>') && !(m[1] ?? '').includes('<cue/>'),
            ).length;
      expect(score.notes.length).toBe(written);
      const order = unroll(score.measures, score.voltas);
      expect(score.measures.length).toBeGreaterThan(0);
      expect(order.order.length).toBeGreaterThanOrEqual(score.measures.length * 0.5);
      console.info(
        `dewidebug corpus ${name}: v${score.version} "${score.title}" parts=${String(score.parts.length)} staves=${score.staves.map((s) => s.name).join('|')} bars=${String(score.measures.length)} played=${String(order.order.length)} order=${order.order
          .slice(0, 40)
          .map((i) => score.measures[i]?.number ?? '?')
          .join(
            ',',
          )} notes=${String(score.notes.length)} voltas=${String(score.voltas.length)} tempos=${score.tempos.map((t) => t.bpm.toFixed(0)).join(',')} warnings=${[...score.warnings, ...order.warnings].join(' / ')}`,
      );
    },
    60_000,
  );
});
