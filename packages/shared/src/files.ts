export const SCORE_EXTENSIONS = ['pdf'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'ogg', 'wav', 'flac'] as const;
export const MUSIC_EXTENSIONS = ['mscz', 'mscx', 'mxl', 'musicxml'] as const;
export const ZIPPED_MUSIC_EXTENSIONS = ['mscz', 'mxl'] as const;

export type FileKind = 'scores' | 'tracks' | 'music';
export const FILE_KINDS = ['scores', 'tracks', 'music'] as const satisfies readonly FileKind[];

export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  mscz: 'application/x-musescore',
  mscx: 'application/x-musescore+xml',
  mxl: 'application/vnd.recordare.musicxml',
  musicxml: 'application/vnd.recordare.musicxml+xml',
};

export const SCORE_ACCEPT = [...SCORE_EXTENSIONS.map((e) => `.${e}`), 'application/pdf'].join(',');
export const AUDIO_ACCEPT = ['audio/*', ...AUDIO_EXTENSIONS.map((e) => `.${e}`)].join(',');
export const MUSIC_ACCEPT = MUSIC_EXTENSIONS.map((e) => `.${e}`).join(',');

export const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

export function isZip(bytes: ArrayLike<number>): boolean {
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function kindOfFile(name: string): FileKind | null {
  const ext = extensionOf(name);
  if ((SCORE_EXTENSIONS as readonly string[]).includes(ext)) return 'scores';
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'tracks';
  if ((MUSIC_EXTENSIONS as readonly string[]).includes(ext)) return 'music';
  return null;
}

export function contentTypeFor(name: string): string {
  return CONTENT_TYPES[extensionOf(name)] ?? 'application/octet-stream';
}

export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
