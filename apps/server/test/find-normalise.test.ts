import {
  COMMONS_SEARCH_RESPONSE,
  COMMONS_UNCLEAR_LICENCE_PAGE,
  MUTOPIA_GUITAR_BLOCK,
  MUTOPIA_NO_MATCHES,
  MUTOPIA_RESULT_BLOCKS,
  mutopiaListing,
} from '@pcaa/fixtures';
import { chooseImportFiles } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import { commonsSearchUrl, parseCommons } from '../src/find/commons.ts';
import { creativeCommonsUrl, isOpenLicence } from '../src/find/licence.ts';
import { decodeEntities, mutopiaSearchUrl, parseMutopia } from '../src/find/mutopia.ts';

const BASE = 'https://www.mutopiaproject.org';

describe('parseMutopia', () => {
  const { results, hidden } = parseMutopia(mutopiaListing(), BASE);
  const op9no1 = results.find((r) => r.id === 'mutopia:582');

  it('reads every result block of a real listing', () => {
    expect(results.map((r) => r.id)).toEqual(['mutopia:1590', 'mutopia:1955', 'mutopia:582']);
    expect(hidden).toBe(0);
  });

  it('reads the Op. 9 No. 1 nocturne with its licence and source page', () => {
    expect(op9no1).toMatchObject({
      source: 'mutopia',
      sourceName: 'Mutopia Project',
      title: 'Nocturne No. 1 in B-flat minor',
      composer: 'F. F. Chopin',
      instrument: 'Piano',
      detail: 'Op. 9, No. 1',
      licence: 'Creative Commons Attribution-ShareAlike 2.5',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
      pageUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
    });
  });

  it('keeps the A4 PDF and the MIDI file and drops LilyPond, previews and PostScript', () => {
    expect(op9no1?.files.map((f) => [f.ext, f.label])).toEqual([
      ['pdf', 'PDF (A4)'],
      ['pdf', 'PDF (Letter)'],
      ['mid', 'MIDI'],
    ]);
    expect(op9no1?.files[0]?.url).toBe(
      'https://www.mutopiaproject.org/ftp/ChopinFF/O9/nocturne_in_b-flat_minor/nocturne_in_b-flat_minor-a4.pdf',
    );
  });

  it('puts A4 first even when the listing gives Letter first, and public domain gets a licence link', () => {
    const [guitar] = parseMutopia(mutopiaListing([MUTOPIA_GUITAR_BLOCK]), BASE).results;
    expect(guitar?.files[0]?.label).toBe('PDF (A4)');
    expect(guitar?.licence).toBe('Public Domain');
    expect(guitar?.licenceUrl).toBe('https://creativecommons.org/licenses/publicdomain/');
    expect(guitar?.instrument).toBe('Guitar');
  });

  it('never offers a file from another host', () => {
    const [guitar] = parseMutopia(mutopiaListing([MUTOPIA_GUITAR_BLOCK]), BASE).results;
    expect(guitar?.files.map((f) => f.ext)).toEqual(['pdf', 'pdf']);
  });

  it('follows a stand-in base URL, so tests and the e2e never touch the real site', () => {
    const stand = 'http://127.0.0.1:9';
    const parsed = parseMutopia(mutopiaListing(MUTOPIA_RESULT_BLOCKS, stand), stand);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results.every((r) => r.pageUrl.startsWith(`${stand}/cgibin/`))).toBe(true);
    expect(parsed.results.flatMap((r) => r.files).every((f) => f.url.startsWith(stand))).toBe(true);
  });

  it('says nothing was found as an empty list', () => {
    expect(parseMutopia(MUTOPIA_NO_MATCHES, BASE)).toEqual({ results: [], hidden: 0 });
  });

  it('hides a result whose licence it does not recognise as open', () => {
    const closed = MUTOPIA_GUITAR_BLOCK.replace('Public Domain', 'All rights reserved');
    expect(parseMutopia(mutopiaListing([closed]), BASE)).toEqual({ results: [], hidden: 1 });
  });

  it('builds the search address from the query', () => {
    expect(mutopiaSearchUrl(BASE, 'Chopin Nocturne')).toBe(
      'https://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=Chopin+Nocturne',
    );
  });
});

describe('parseCommons', () => {
  it('keeps the public-domain PDFs in relevance order and drops what is not a PDF', () => {
    const { results, hidden } = parseCommons(COMMONS_SEARCH_RESPONSE);
    expect(results.map((r) => r.title)).toEqual([
      'Chopin-Nocturne-no2-Variations',
      'Chopin Nocturnes Op 9 Kistner First Edition 1832',
      'Nocturnes, Op.9',
    ]);
    expect(hidden).toBe(1);
  });

  it('carries licence, page count, size and the Commons page, and strips tracking from the file URL', () => {
    const op9 = parseCommons(COMMONS_SEARCH_RESPONSE).results.find(
      (r) => r.title === 'Nocturnes, Op.9',
    );
    expect(op9).toMatchObject({
      source: 'commons',
      sourceName: 'Wikimedia Commons',
      licence: 'Public domain',
      detail: '6 pages',
      pageUrl:
        'https://commons.wikimedia.org/wiki/File:Nocturnes,_Op.9_(IA_imslp-op9-chopin-frdric).pdf',
    });
    expect(op9?.files).toEqual([
      {
        ext: 'pdf',
        label: 'PDF',
        bytes: 2260022,
        url: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Nocturnes%2C_Op.9_%28IA_imslp-op9-chopin-frdric%29.pdf',
      },
    ]);
  });

  it('hides a file whose licence is not clearly open', () => {
    const json = { query: { pages: [COMMONS_UNCLEAR_LICENCE_PAGE] } };
    expect(parseCommons(json)).toEqual({ results: [], hidden: 1 });
  });

  it('hides a PDF over the size cap', () => {
    const [page] = COMMONS_SEARCH_RESPONSE.query.pages;
    const big = { ...page, imageinfo: [{ ...page.imageinfo[0], size: 60 * 1024 * 1024 }] };
    expect(parseCommons({ query: { pages: [big] } })).toEqual({ results: [], hidden: 1 });
  });

  it('treats an answer with no pages, or a different shape, as nothing found', () => {
    expect(parseCommons({ batchcomplete: true })).toEqual({ results: [], hidden: 0 });
    expect(parseCommons('nonsense')).toEqual({ results: [], hidden: 0 });
  });

  it('asks the Commons API for PDFs with licence data', () => {
    const url = new URL(commonsSearchUrl('https://commons.wikimedia.org/w/api.php', 'Chopin'));
    expect(url.searchParams.get('gsrsearch')).toBe('Chopin filetype:office');
    expect(url.searchParams.get('iiprop')).toContain('extmetadata');
    expect(url.searchParams.get('gsrlimit')).toBe('8');
  });
});

describe('licences', () => {
  it.each([
    [
      'Creative Commons Attribution-ShareAlike 4.0',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ],
    ['Creative Commons Attribution 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
    ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
    ['CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'],
    ['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
    ['All rights reserved', null],
  ])('%s links to %s', (name, url) => {
    expect(creativeCommonsUrl(name)).toBe(url);
  });

  it.each([
    ['Public domain', true],
    ['CC BY-SA 3.0', true],
    ['Creative Commons Attribution-ShareAlike 2.5', true],
    ['CC BY-NC 4.0', false],
    ['All rights reserved', false],
    ['', false],
  ])('%s is open: %s', (name, open) => {
    expect(isOpenLicence(name)).toBe(open);
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities and leaves unknown ones alone', () => {
    expect(decodeEntities('A &amp; B &#233; &#x2013; &nbsp;&bogus;')).toBe('A & B é –  &bogus;');
  });
});

describe('chooseImportFiles', () => {
  const file = (ext: 'pdf' | 'mid' | 'mxl' | 'mscz', label: string) => ({
    ext,
    label,
    url: `https://x.example/${label}.${ext}`,
    bytes: null,
  });

  it('takes the first PDF for the score and the richest music file for Play-along', () => {
    const choice = chooseImportFiles([
      file('pdf', 'a4'),
      file('pdf', 'letter'),
      file('mid', 'midi'),
      file('mxl', 'xml'),
    ]);
    expect(choice.score?.label).toBe('a4');
    expect(choice.music?.ext).toBe('mxl');
  });

  it('prefers MuseScore over MIDI and says when a kind is missing', () => {
    expect(chooseImportFiles([file('mid', 'm'), file('mscz', 's')]).music?.ext).toBe('mscz');
    expect(chooseImportFiles([file('pdf', 'p')])).toEqual({ score: file('pdf', 'p'), music: null });
  });
});
