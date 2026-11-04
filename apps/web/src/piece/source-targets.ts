import type { FileKind, FileName, Piece, PiecePatch, PieceSource, SourceEdit } from '@pcaa/shared';

export const WHOLE_PIECE = 'piece';

export type Target = typeof WHOLE_PIECE | FileName;

export interface FileEntry {
  kind: FileKind;
  file: FileName;
  name: string;
  source: PieceSource | undefined;
}

export function filesOf(piece: Piece): FileEntry[] {
  const entries = (kind: FileKind, refs: Piece['scores'] | Piece['music'] | Piece['tracks']) =>
    refs.map((r) => ({ kind, file: r.file, name: r.name, source: r.source }));
  return [
    ...entries('scores', piece.scores),
    ...entries('music', piece.music),
    ...entries('tracks', piece.tracks),
  ];
}

export function sourceOf(piece: Piece, target: Target): PieceSource | undefined {
  return target === WHOLE_PIECE
    ? piece.source
    : filesOf(piece).find((f) => f.file === target)?.source;
}

export function patchFor(target: Target, source: SourceEdit | null): PiecePatch {
  return target === WHOLE_PIECE ? { source } : { fileSource: { file: target, source } };
}
