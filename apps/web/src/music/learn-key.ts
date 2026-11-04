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
  bytes: Uint8Array,
): Promise<number> {
  let key: WrittenKey;
  try {
    const { score } = readScore(bytes);
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
  await api.patchPiece(pieceId, { transposeFile: { file, transpose: shift } });
  return shift;
}
