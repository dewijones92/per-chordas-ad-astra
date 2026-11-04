import { bitKey, pieceKey, type TodayBit, type TodayFacts, type TodayPiece } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import {
  describeSuggestion,
  rankToday,
  suggestionHref,
  TODAY_LIMIT,
} from '../src/library/today.ts';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 10, 4, 12, 0).getTime();
const daysAgo = (n: number) => NOW - n * DAY;

const bit = (id: string, bestSpeed: number, over: Partial<TodayBit> = {}): TodayBit =>
  ({ file: 'a.mscz', id, name: id, fromBar: 1, toBar: 4, bestSpeed, ...over }) as TodayBit;

const piece = (id: string, over: Partial<TodayPiece> = {}): TodayPiece =>
  ({
    id,
    title: id,
    pinned: false,
    targetBpm: null,
    lastPractisedAt: null,
    bestBpm: null,
    bits: [],
    ...over,
  }) as TodayPiece;

const facts = (...pieces: TodayPiece[]): TodayFacts => ({ pieces });
const stamps = (entries: Record<string, number> = {}) => new Map(Object.entries(entries));
const keyOf = (p: string, b: string) => bitKey(p, 'a.mscz', b);
const ids = (s: ReturnType<typeof rankToday>) => s.map((x) => x.bit?.id ?? x.pieceId);

describe('rankToday: hard bits', () => {
  it('suggests a bit that is well below full speed, saying so and when it was last tried', () => {
    const f = facts(
      piece('gran-vals', { title: 'Gran Vals', bits: [bit('run', 0.55, { name: 'The run' })] }),
    );
    const out = rankToday(f, stamps({ [keyOf('gran-vals', 'run')]: daysAgo(6) }), stamps(), NOW);
    expect(out).toHaveLength(1);
    expect(describeSuggestion(out[0]!, NOW)).toBe(
      '📌 ‘The run’ in Gran Vals: best 55%, last tried 6 days ago',
    );
  });

  it('ranks the slower bit above the staler one, and a stale mastered bit still comes back', () => {
    const f = facts(
      piece('p', { bits: [bit('slow', 0.3), bit('stale', 0.95), bit('fresh', 1)] }),
      piece('q', { bits: [bit('old-master', 1)] }),
    );
    const out = rankToday(
      f,
      stamps({
        [keyOf('p', 'slow')]: daysAgo(2),
        [keyOf('p', 'stale')]: daysAgo(20),
        [keyOf('p', 'fresh')]: daysAgo(3),
        [keyOf('q', 'old-master')]: daysAgo(10),
      }),
      stamps(),
      NOW,
    );
    expect(ids(out)).toEqual(['slow', 'stale', 'old-master']);
  });

  it('leaves out a bit tried within the last day, however slow', () => {
    const f = facts(piece('p', { bits: [bit('slow', 0.2)] }));
    const recent = stamps({ [keyOf('p', 'slow')]: NOW - 3 * 3600 * 1000 });
    expect(rankToday(f, recent, stamps(), NOW)).toEqual([]);
  });

  it('with no try on record suggests only a bit that is below speed, never a mastered one', () => {
    const f = facts(
      piece('p', { bits: [bit('mastered', 1), bit('never-got-a-best', 0), bit('slowish', 0.8)] }),
    );
    const out = rankToday(f, stamps(), stamps(), NOW);
    expect(ids(out)).toEqual(['never-got-a-best', 'slowish']);
    expect(describeSuggestion(out[0]!, NOW)).toBe('📌 ‘never-got-a-best’ in p: no best speed yet');
  });

  it('treats best above 100% as full speed', () => {
    const f = facts(piece('p', { bits: [bit('fast', 1.2)] }));
    expect(rankToday(f, stamps(), stamps(), NOW)).toEqual([]);
  });

  it('breaks ties by piece title then bit name', () => {
    const f = facts(
      piece('b', {
        title: 'Beta',
        bits: [bit('z', 0.5, { name: 'Zed' }), bit('a', 0.5, { name: 'Alpha' })],
      }),
      piece('a', { title: 'Alpha piece', bits: [bit('x', 0.5)] }),
    );
    expect(ids(rankToday(f, stamps(), stamps(), NOW))).toEqual(['x', 'a', 'z']);
  });

  it('shows at most two bits of one piece and five suggestions in all', () => {
    const many = (id: string) => piece(id, { bits: [bit('1', 0.1), bit('2', 0.2), bit('3', 0.3)] });
    const out = rankToday(
      facts(many('a'), many('b'), many('c'), many('d')),
      stamps(),
      stamps(),
      NOW,
    );
    expect(out).toHaveLength(TODAY_LIMIT);
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(out.filter((s) => s.pieceId === id).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('rankToday: pinned pieces', () => {
  it('suggests a pinned piece not practised for a few days, with its best and target tempo', () => {
    const f = facts(
      piece('waltz', {
        title: 'Waltz',
        pinned: true,
        lastPractisedAt: daysAgo(5),
        bestBpm: 90,
        targetBpm: 120,
      }),
    );
    const out = rankToday(f, stamps(), stamps(), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.bit).toBeNull();
    expect(describeSuggestion(out[0]!, NOW)).toBe(
      '⭐ Waltz: last practised 5 days ago, best 90 of 120 BPM',
    );
  });

  it('skips a pinned piece practised in the last two days, and any piece that is not pinned', () => {
    const f = facts(
      piece('recent', { pinned: true, lastPractisedAt: daysAgo(2) }),
      piece('plain', { pinned: false, lastPractisedAt: daysAgo(30) }),
    );
    expect(rankToday(f, stamps(), stamps(), NOW)).toEqual([]);
  });

  it('suggests a pinned piece never practised', () => {
    const out = rankToday(facts(piece('new', { pinned: true })), stamps(), stamps(), NOW);
    expect(describeSuggestion(out[0]!, NOW)).toBe('⭐ new: not practised yet');
  });

  it('shows only the hard bit when a pinned piece also has one worth practising', () => {
    const f = facts(
      piece('p', { pinned: true, lastPractisedAt: daysAgo(9), bits: [bit('run', 0.4)] }),
    );
    expect(ids(rankToday(f, stamps(), stamps(), NOW))).toEqual(['run']);
  });

  it('puts a long-neglected pinned piece above a mildly slow bit', () => {
    const f = facts(
      piece('old', { pinned: true, lastPractisedAt: daysAgo(40) }),
      piece('p', { bits: [bit('mild', 0.85)] }),
    );
    expect(ids(rankToday(f, stamps(), stamps(), NOW))).toEqual(['old', 'mild']);
  });
});

describe('rankToday: done for today and nothing to say', () => {
  const f = facts(piece('p', { pinned: true, bits: [bit('run', 0.4), bit('coda', 0.5)] }));

  it('hides an item marked done today and shows it again tomorrow', () => {
    const doneToday = stamps({ [keyOf('p', 'run')]: new Date(2026, 10, 4, 8, 0).getTime() });
    expect(ids(rankToday(f, stamps(), doneToday, NOW))).toEqual(['coda']);
    const doneYesterday = stamps({ [keyOf('p', 'run')]: new Date(2026, 10, 3, 23, 0).getTime() });
    expect(ids(rankToday(f, stamps(), doneYesterday, NOW))).toEqual(['run', 'coda']);
  });

  it('does not fall back to the piece when every bit is done, and the piece itself can be done', () => {
    const allDone = stamps({ [keyOf('p', 'run')]: NOW, [keyOf('p', 'coda')]: NOW });
    expect(rankToday(f, stamps(), allDone, NOW)).toEqual([]);
    const g = facts(piece('q', { pinned: true }));
    expect(rankToday(g, stamps(), stamps({ [pieceKey('q')]: NOW }), NOW)).toEqual([]);
  });

  it('returns nothing for an empty library', () => {
    expect(rankToday(facts(), stamps(), stamps(), NOW)).toEqual([]);
  });
});

describe('suggestionHref', () => {
  it('opens a piece, or a piece on one hard bit of one file', () => {
    const f = facts(
      piece('p', { pinned: true, bits: [] }),
      piece('q', { bits: [bit('b 1', 0.2, { file: 'a b.mscz' as TodayBit['file'] })] }),
    );
    const out = rankToday(f, stamps(), stamps(), NOW);
    const hrefs = Object.fromEntries(out.map((s) => [s.pieceId, suggestionHref(s)]));
    expect(hrefs['p']).toBe('/piece/p');
    expect(hrefs['q']).toBe('/piece/q?bit=b+1&file=a+b.mscz');
  });
});
