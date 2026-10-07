import type { Piece } from '@pcaa/shared';
import MiniSearch from 'minisearch';

export interface PieceFilter {
  query: string;
  tags: readonly string[];
  pieceIds?: readonly string[] | null;
}

export function allTags(pieces: readonly Piece[]): string[] {
  return [...new Set(pieces.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));
}

export type PieceIndex = MiniSearch<Piece>;

export function buildPieceIndex(pieces: readonly Piece[]): PieceIndex {
  const index = new MiniSearch<Piece>({
    fields: ['title', 'artist', 'tagText', 'notes'],
    storeFields: ['id'],
    extractField: (doc, field) => {
      switch (field) {
        case 'tagText':
          return doc.tags.join(' ');
        case 'title':
          return doc.title;
        case 'artist':
          return doc.artist;
        case 'notes':
          return doc.notes;
        default:
          return doc.id;
      }
    },
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, artist: 2, tagText: 2 } },
  });
  index.addAll(pieces);
  return index;
}

export function filterPieces(
  pieces: readonly Piece[],
  filter: PieceFilter,
  index: PieceIndex = buildPieceIndex(pieces),
): Piece[] {
  let result = [...pieces];
  if (filter.pieceIds) {
    const order = new Map(filter.pieceIds.map((id, i) => [id, i]));
    result = result
      .filter((p) => order.has(p.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  if (filter.tags.length > 0)
    result = result.filter((p) => filter.tags.every((t) => p.tags.includes(t)));
  const query = filter.query.trim();
  if (query === '') return result;
  const byId = new Map(result.map((p) => [p.id as string, p]));
  return index.search(query).flatMap((hit) => {
    const piece = byId.get(hit.id as string);
    return piece ? [piece] : [];
  });
}
