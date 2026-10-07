export const SCORE_EXTENSIONS = ['pdf'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'ogg', 'wav', 'flac'] as const;

export type FileKind = 'scores' | 'tracks';

export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

export const SCORE_ACCEPT = [...SCORE_EXTENSIONS.map((e) => `.${e}`), 'application/pdf'].join(',');
export const AUDIO_ACCEPT = ['audio/*', ...AUDIO_EXTENSIONS.map((e) => `.${e}`)].join(',');

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function kindOfFile(name: string): FileKind | null {
  const ext = extensionOf(name);
  if ((SCORE_EXTENSIONS as readonly string[]).includes(ext)) return 'scores';
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'tracks';
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
