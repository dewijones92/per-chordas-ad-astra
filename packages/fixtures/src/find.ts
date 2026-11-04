import {
  COMMONS_FILE_ORIGIN,
  COMMONS_SEARCH_RESPONSE,
  MUTOPIA_ORIGIN,
  MUTOPIA_RESULT_BLOCKS,
} from './find-data.ts';

export {
  COMMONS_FILE_ORIGIN,
  COMMONS_SEARCH_RESPONSE,
  MUTOPIA_ORIGIN,
  MUTOPIA_RESULT_BLOCKS,
} from './find-data.ts';

export const MUTOPIA_GUITAR_BLOCK = [
  '<table class="table-bordered result-table">',
  '<tr><td>Study in A minor</td>',
  '<td>by A. Example (1800–1850)</td>',
  '<td>Op. 1, No. 1</td>',
  '<td>&nbsp;</td>',
  '</tr><tr>',
  '<td>for Guitar</td>',
  '<td>1830</td>',
  '<td>Romantic</td>',
  '<td></td>',
  '</tr><tr>',
  '<td>Example edition, 1900</td>',
  '<td><a href="../legal.html#pd">Public Domain</a></td>',
  '<td><a href="piece-info.cgi?id=9001">More Information</a></td>',
  '<td>2010/01/01</td>',
  '</tr><tr>',
  '<td>Download: <a href="https://www.mutopiaproject.org/ftp/ExampleA/O1/study/study.ly">.ly file</a></td>',
  '<td><a href="https://elsewhere.example/study.mid">.mid file</a></td>',
  '</tr><tr>',
  '<td><a href="https://www.mutopiaproject.org/ftp/ExampleA/O1/study/study-let.pdf">Letter .pdf file</a></td>',
  '<td><a href="https://www.mutopiaproject.org/ftp/ExampleA/O1/study/study-a4.pdf">A4 .pdf file</a></td>',
  '</tr>',
  '</table>',
].join('\n');

const SHELL_HEAD =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <title>Music Listing - without preview images</title>\n</head>\n<body>\n<div class="container">\n<h2>Music Listing - without preview images</h2>\n<table class="outer-table">\n';
const SHELL_TAIL = '\n</table>\n</div>\n</body>\n</html>\n';

function outerCell(block: string): string {
  return block.startsWith('<tr><td>') ? block : `<tr><td>\n${block}\n</tr></td>`;
}

export function mutopiaListing(
  blocks: readonly string[] = MUTOPIA_RESULT_BLOCKS,
  origin: string = MUTOPIA_ORIGIN,
): string {
  return (SHELL_HEAD + blocks.map(outerCell).join('\n') + SHELL_TAIL).replaceAll(
    MUTOPIA_ORIGIN,
    origin,
  );
}

export const MUTOPIA_NO_MATCHES =
  SHELL_HEAD +
  '<div class="alert alert-info" role="alert">\n  Sorry, no matches were found for your search criteria.\n</div>' +
  SHELL_TAIL;

export function commonsResponse(fileOrigin: string = COMMONS_FILE_ORIGIN): string {
  return JSON.stringify(COMMONS_SEARCH_RESPONSE).replaceAll(COMMONS_FILE_ORIGIN, fileOrigin);
}

export const COMMONS_UNCLEAR_LICENCE_PAGE = {
  pageid: 1,
  ns: 6,
  title: 'File:Example score all rights reserved.pdf',
  index: 9,
  imagerepository: 'local',
  imageinfo: [
    {
      size: 1000,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example_score_all_rights_reserved.pdf',
      descriptionurl:
        'https://commons.wikimedia.org/wiki/File:Example_score_all_rights_reserved.pdf',
      extmetadata: { LicenseShortName: { value: 'All rights reserved' } },
      mime: 'application/pdf',
    },
  ],
} as const;
