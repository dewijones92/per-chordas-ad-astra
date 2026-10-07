import { describe, expect, it } from 'vitest';
import { resolveInside, stringifyForGit } from '../src/store/files.ts';

describe('stringifyForGit', () => {
  it('keeps number arrays on one line so a stroke is one line per point', () => {
    const text = stringifyForGit({
      points: [
        [70.14, 134.28, 0.5],
        [-1, 2e-3, 1],
      ],
      tags: ['a', 'b'],
    });
    expect(text).toContain('[70.14, 134.28, 0.5]');
    expect(text).toContain('[-1, 0.002, 1]');
    expect(text).toContain('"tags": [\n    "a",\n    "b"\n  ]');
    expect(JSON.parse(text)).toEqual({
      points: [
        [70.14, 134.28, 0.5],
        [-1, 0.002, 1],
      ],
      tags: ['a', 'b'],
    });
  });

  it('leaves empty arrays and objects alone', () => {
    expect(JSON.parse(stringifyForGit({ a: [], b: {} }))).toEqual({ a: [], b: {} });
  });
});

describe('resolveInside', () => {
  it('allows the root and paths below it', () => {
    expect(resolveInside('/data', 'pieces', 'x')).toBe('/data/pieces/x');
    expect(resolveInside('/data')).toBe('/data');
  });

  it('refuses siblings that merely share a prefix', () => {
    expect(() => resolveInside('/data', '../data-evil/x')).toThrow();
  });
});
