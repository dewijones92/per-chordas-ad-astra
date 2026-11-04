import { describe, expect, it } from 'vitest';
import { Piece, PiecePatch, PieceSource, SourceEdit } from '../src/schemas.ts';
import {
  applySourceEdit,
  compactCount,
  formatNotedOn,
  formatStars,
  parseCount,
  parseSourceUrl,
  parseStars,
  selfSearchUrl,
  siteNameFor,
} from '../src/source.ts';

describe('siteNameFor', () => {
  it.each([
    ['https://musescore.com/user/123/scores/456', 'MuseScore'],
    ['https://www.musescore.com/sheetmusic?text=x', 'MuseScore'],
    ['https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582', 'Mutopia Project'],
    ['https://imslp.org/wiki/Nocturnes,_Op.9_(Chopin,_Fr%C3%A9d%C3%A9ric)', 'IMSLP'],
    ['https://commons.wikimedia.org/wiki/File:Op9.pdf', 'Wikimedia Commons'],
    ['https://upload.wikimedia.org/wikipedia/commons/a/ab/Op9.pdf', 'Wikimedia Commons'],
    ['https://www.youtube.com/watch?v=abc', 'youtube.com'],
    ['https://example.org/scores', 'example.org'],
  ])('names %s as %s', (url, name) => {
    expect(siteNameFor(url)).toBe(name);
  });

  it('does not take a lookalike host for a known site', () => {
    expect(siteNameFor('https://notmusescore.com/x')).toBe('notmusescore.com');
    expect(siteNameFor('https://musescore.com.evil.example/x')).toBe('musescore.com.evil.example');
  });
});

describe('parseSourceUrl', () => {
  it('accepts http and https links, trimmed', () => {
    expect(parseSourceUrl('  https://musescore.com/user/1/scores/2  ')).toBe(
      'https://musescore.com/user/1/scores/2',
    );
    expect(parseSourceUrl('http://example.org/a')).toBe('http://example.org/a');
  });

  it('adds https when the scheme was left off a pasted address', () => {
    expect(parseSourceUrl('musescore.com/user/1/scores/2')).toBe(
      'https://musescore.com/user/1/scores/2',
    );
  });

  it('refuses anything that is not a web link', () => {
    for (const bad of [
      '',
      '   ',
      'javascript:alert(1)',
      'ftp://example.org/a',
      'file:///etc/passwd',
      'not a link',
      'https://',
      'data:text/html,hi',
    ]) {
      expect(parseSourceUrl(bad), bad).toBeNull();
    }
  });
});

describe('counts and stars', () => {
  it('writes counts the way MuseScore does', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(1500)).toBe('1.5k');
    expect(compactCount(15_200)).toBe('15k');
    expect(compactCount(152_000)).toBe('152k');
    expect(compactCount(999_999)).toBe('1M');
    expect(compactCount(1_200_000)).toBe('1.2M');
  });

  it('reads what a person types: plain, with commas, or with k and M', () => {
    expect(parseCount('120')).toBe(120);
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('15k')).toBe(15_000);
    expect(parseCount('1.5K')).toBe(1500);
    expect(parseCount('1.2M')).toBe(1_200_000);
    expect(parseCount(' 7 ')).toBe(7);
  });

  it('refuses text that is not a count', () => {
    for (const bad of ['', 'lots', '-3', '1.5', '12x', 'k', '1e9999']) {
      expect(parseCount(bad), bad).toBeNull();
    }
  });

  it('keeps stars to one decimal between 0 and 5', () => {
    expect(parseStars('4.8')).toBe(4.8);
    expect(parseStars('5')).toBe(5);
    expect(parseStars('4.75')).toBe(4.8);
    expect(parseStars('0')).toBe(0);
    expect(parseStars('4,8')).toBe(4.8);
    for (const bad of ['', '5.1', '-1', 'five', '4.8x']) expect(parseStars(bad), bad).toBeNull();
  });

  it('shows stars with one decimal', () => {
    expect(formatStars(4.8)).toBe('4.8');
    expect(formatStars(5)).toBe('5.0');
    expect(formatStars(0)).toBe('0.0');
  });

  it('shows the date a rating was noted', () => {
    expect(formatNotedOn('2026-11-04')).toBe('4 Nov 2026');
    expect(formatNotedOn('2026-09-30')).toBe('30 Sep 2026');
    expect(formatNotedOn('2027-01-01')).toBe('1 Jan 2027');
  });
});

describe('selfSearchUrl', () => {
  it('builds the sites own search address for a query', () => {
    expect(selfSearchUrl('musescore', 'chopin nocturne')).toBe(
      'https://musescore.com/sheetmusic?text=chopin+nocturne',
    );
    expect(selfSearchUrl('imslp', 'chopin nocturne')).toBe(
      'https://imslp.org/index.php?search=chopin+nocturne',
    );
  });

  it('escapes what would break the address, and falls back to the site search page', () => {
    expect(selfSearchUrl('musescore', 'a&b=c #1')).toBe(
      'https://musescore.com/sheetmusic?text=a%26b%3Dc+%231',
    );
    expect(selfSearchUrl('musescore', '   ')).toBe('https://musescore.com/sheetmusic');
    expect(selfSearchUrl('imslp', '')).toBe('https://imslp.org/');
  });
});

describe('the origin of a piece', () => {
  const old = {
    name: 'Mutopia Project',
    url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
    licence: 'Creative Commons Attribution-ShareAlike 2.5',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
  };

  it('still reads the shape Find a score wrote before ratings existed', () => {
    expect(PieceSource.parse(old)).toEqual({ ...old, rating: null });
    const piece = Piece.parse({
      id: 'nocturne',
      title: 'Nocturne',
      source: old,
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
    });
    expect(piece.source?.rating).toBeNull();
  });

  it('allows a link with no licence', () => {
    expect(PieceSource.parse({ name: 'MuseScore', url: 'https://musescore.com/x' })).toMatchObject({
      licence: null,
      licenceUrl: null,
      rating: null,
    });
  });

  it('refuses a link that is not http or https', () => {
    expect(PieceSource.safeParse({ ...old, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(SourceEdit.safeParse({ url: 'ftp://example.org/a', rating: null }).success).toBe(false);
    expect(SourceEdit.safeParse({ url: 'not a link', rating: null }).success).toBe(false);
  });

  it('needs at least one number in a rating, and stars within 0 to 5 in tenths', () => {
    const ok = (rating: unknown) =>
      SourceEdit.safeParse({ url: 'https://musescore.com/x', rating }).success;
    expect(ok({ stars: 4.8, ratings: 120, views: 15_000 })).toBe(true);
    expect(ok({ stars: null, ratings: null, views: 9000 })).toBe(true);
    expect(ok({ stars: null, ratings: null, views: null })).toBe(false);
    expect(ok({ stars: 5.1, ratings: null, views: null })).toBe(false);
    expect(ok({ stars: 4.85, ratings: null, views: null })).toBe(false);
    expect(ok({ stars: 4, ratings: -1, views: null })).toBe(false);
    expect(ok({ stars: 4, ratings: 1.5, views: null })).toBe(false);
  });

  it('can be patched on its own, or cleared with null', () => {
    expect(
      PiecePatch.safeParse({ source: { url: 'https://musescore.com/x', rating: null } }).success,
    ).toBe(true);
    expect(PiecePatch.safeParse({ source: null }).success).toBe(true);
  });
});

describe('applySourceEdit', () => {
  const rating = { stars: 4.8, ratings: 120, views: 15_000 };
  const base = {
    name: 'Mutopia Project',
    url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
    licence: 'Public Domain',
    licenceUrl: 'https://creativecommons.org/licenses/publicdomain/',
    rating: null,
  };

  it('names a new link by its site and stamps the date on its rating', () => {
    expect(
      applySourceEdit(
        undefined,
        { url: 'https://musescore.com/user/1/scores/2', rating },
        '2026-11-04',
      ),
    ).toEqual({
      name: 'MuseScore',
      url: 'https://musescore.com/user/1/scores/2',
      licence: null,
      licenceUrl: null,
      rating: { ...rating, notedOn: '2026-11-04' },
    });
  });

  it('keeps the name and licence while the link stays the same, and drops them when the link changes', () => {
    expect(applySourceEdit(base, { url: base.url, rating: null }, '2026-11-04')).toEqual(base);
    expect(
      applySourceEdit(
        { ...base, name: 'Mirror', url: 'http://127.0.0.1:9/p' },
        { url: 'http://127.0.0.1:9/p', rating: null },
        '2026-11-04',
      ).name,
    ).toBe('Mirror');
    expect(
      applySourceEdit(base, { url: 'https://imslp.org/wiki/x', rating: null }, '2026-11-04'),
    ).toMatchObject({ name: 'IMSLP', licence: null, licenceUrl: null });
  });

  it('keeps the old date when the numbers did not change, and restamps when they did', () => {
    const rated = { ...base, rating: { ...rating, notedOn: '2026-10-01' } };
    expect(applySourceEdit(rated, { url: base.url, rating }, '2026-11-04').rating?.notedOn).toBe(
      '2026-10-01',
    );
    expect(
      applySourceEdit(rated, { url: base.url, rating: { ...rating, views: 16_000 } }, '2026-11-04')
        .rating,
    ).toEqual({ ...rating, views: 16_000, notedOn: '2026-11-04' });
  });

  it('drops the rating when the edit has none', () => {
    const rated = { ...base, rating: { ...rating, notedOn: '2026-10-01' } };
    expect(applySourceEdit(rated, { url: base.url, rating: null }, '2026-11-04').rating).toBeNull();
  });
});
