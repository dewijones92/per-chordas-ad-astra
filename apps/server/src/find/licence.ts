const CC = 'https://creativecommons.org';

export function creativeCommonsUrl(name: string): string | null {
  const text = name.trim();
  const share = /attribution[- ]share[- ]?alike (\d\.\d)|cc by-sa (\d\.\d)/i.exec(text);
  if (share) return `${CC}/licenses/by-sa/${share[1] ?? share[2] ?? ''}/`;
  const attribution = /attribution (\d\.\d)|cc by (\d\.\d)/i.exec(text);
  if (attribution) return `${CC}/licenses/by/${attribution[1] ?? attribution[2] ?? ''}/`;
  if (/^cc0/i.test(text)) return `${CC}/publicdomain/zero/1.0/`;
  if (/^public domain$/i.test(text)) return `${CC}/licenses/publicdomain/`;
  return null;
}

const OPEN = /^(public domain|pd\b|cc0|cc by(-sa)? \d|creative commons attribution)/i;

export function isOpenLicence(name: string): boolean {
  return OPEN.test(name.trim());
}
