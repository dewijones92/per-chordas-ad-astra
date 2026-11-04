import { describe, expect, it } from 'vitest';
import { ratingLine } from '../src/strings.ts';

const noted = '2026-11-04';

describe('ratingLine', () => {
  it('shows stars to one decimal, the ratings, compact views and the day it was noted', () => {
    expect(ratingLine({ stars: 4.8, ratings: 120, views: 15_000, notedOn: noted })).toBe(
      '⭐ 4.8 (120 ratings) · 15k views · noted 4 Nov 2026',
    );
  });

  it('keeps a whole number of stars at one decimal', () => {
    expect(ratingLine({ stars: 5, ratings: null, views: null, notedOn: noted })).toBe(
      '⭐ 5.0 · noted 4 Nov 2026',
    );
  });

  it('says one rating and one view in the singular', () => {
    expect(ratingLine({ stars: 3.5, ratings: 1, views: 1, notedOn: noted })).toBe(
      '⭐ 3.5 (1 rating) · 1 view · noted 4 Nov 2026',
    );
  });

  it('still reads when only some of the numbers were typed', () => {
    expect(ratingLine({ stars: null, ratings: 40, views: null, notedOn: noted })).toBe(
      '⭐ 40 ratings · noted 4 Nov 2026',
    );
    expect(ratingLine({ stars: null, ratings: null, views: 1_200_000, notedOn: noted })).toBe(
      '👀 1.2M views · noted 4 Nov 2026',
    );
  });
});
