import { api } from '../api/client.ts';
import { readScore } from './load.ts';

export interface WrittenKey {
  fifths: number;
  minor: boolean;
}

const OCTAVE = 12;
const FIFTH = 7;
const A = 9;

export function learnKeyShift(key: WrittenKey): number {
  const tonic = (((key.fifths * FIFTH + (key.minor ? A : 0)) % OCTAVE) + OCTAVE) % OCTAVE;
  const target = key.minor ? A : 0;
  return ((((target - tonic) % OCTAVE) + OCTAVE + 6) % OCTAVE) - 6;
}

export async function startInLearnKey(
  pieceId: string,
  file: string,
  upload: File,
): Promise<number> {
  let key: WrittenKey;
  try {
    const { score } = readScore(new Uint8Array(await upload.arrayBuffer()));
    key = score.keys[0] ?? { fifths: 0, minor: false };
  } catch (error) {
    console.info('dewidebug learn key skipped: the file could not be read here', {
      file,
      error: String(error),
    });
    return 0;
  }
  const shift = learnKeyShift(key);
  console.info('dewidebug learn key', { pieceId, file, key, shift });
  if (shift === 0) return 0;
  const piece = await api.getPiece(pieceId);
  const music = piece.music.map((m) => (m.file === file ? { ...m, transpose: shift } : m));
  await api.patchPiece(pieceId, { music });
  return shift;
}
