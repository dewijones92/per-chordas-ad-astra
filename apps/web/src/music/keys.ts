const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
const MAJOR_BY_FIFTHS = [
  'G♭',
  'D♭',
  'A♭',
  'E♭',
  'B♭',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F♯',
] as const;
const MINOR_BY_FIFTHS = [
  'E♭',
  'B♭',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F♯',
  'C♯',
  'G♯',
  'D♯',
] as const;

export const LOWEST_PIANO_KEY = 21;
export const HIGHEST_PIANO_KEY = 108;

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);
}

export function normaliseFifths(fifths: number): number {
  let f = ((fifths % 12) + 12) % 12;
  if (f > 6) f -= 12;
  return f;
}

export function transposeFifths(fifths: number, semitones: number): number {
  return normaliseFifths(fifths + 7 * semitones);
}

export function majorKeyName(fifths: number): string {
  return MAJOR_BY_FIFTHS[normaliseFifths(fifths) + 6] ?? 'C';
}

export function keyName(fifths: number, minor: boolean): string {
  return minor
    ? `${MINOR_BY_FIFTHS[normaliseFifths(fifths) + 6] ?? 'A'} minor`
    : `${majorKeyName(fifths)} major`;
}

export const MAX_CAPO = 9;

export function capoFor(semitones: number): number | null {
  return semitones >= 1 && semitones <= MAX_CAPO ? semitones : null;
}

export function pitchName(pitch: number, preferFlats = false): string {
  const pc = ((pitch % 12) + 12) % 12;
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc] ?? '?';
}

export function noteName(pitch: number, preferFlats = false): string {
  return `${pitchName(pitch, preferFlats)}${String(Math.floor(pitch / 12) - 1)}`;
}

export function signedSemitones(n: number): string {
  if (n === 0) return 'written key';
  return `${n > 0 ? '+' : '−'}${String(Math.abs(n))} semitone${Math.abs(n) === 1 ? '' : 's'}`;
}

const MIN_FITTED_KEYS = 36;

export interface KeyRange {
  low: number;
  high: number;
}

export function fitRange(lowest: number, highest: number, full: boolean): KeyRange {
  if (full) return { low: LOWEST_PIANO_KEY, high: HIGHEST_PIANO_KEY };
  let low = Math.floor(Math.min(lowest, highest) / 12) * 12;
  let high = Math.ceil((Math.max(lowest, highest) + 1) / 12) * 12 - 1;
  while (high - low + 1 < MIN_FITTED_KEYS) {
    if (low - 12 >= LOWEST_PIANO_KEY - 9) low -= 12;
    if (high - low + 1 < MIN_FITTED_KEYS) high += 12;
  }
  return { low: Math.max(low, 0), high: Math.min(high, 127) };
}
