export const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
] as const;

export interface NoteReading {
  midi: number;
  name: (typeof NOTE_NAMES)[number];
  octave: number;
  cents: number;
  targetHz: number;
}

export function midiToHz(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function hzToNote(hz: number, a4 = 440): NoteReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const exact = 69 + 12 * Math.log2(hz / a4);
  const midi = Math.round(exact);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] ?? 'C';
  return {
    midi,
    name,
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((exact - midi) * 1000) / 10,
    targetHz: midiToHz(midi, a4),
  };
}

export interface Tuning {
  id: string;
  name: string;
  strings: readonly number[];
}

export const TUNINGS: readonly Tuning[] = [
  { id: 'standard', name: 'Standard (E A D G B E)', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'drop-d', name: 'Drop D (D A D G B E)', strings: [38, 45, 50, 55, 59, 64] },
  {
    id: 'half-down',
    name: 'Half step down (E♭ A♭ D♭ G♭ B♭ E♭)',
    strings: [39, 44, 49, 54, 58, 63],
  },
  { id: 'dadgad', name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
  { id: 'open-g', name: 'Open G (D G D G B D)', strings: [38, 43, 50, 55, 59, 62] },
  { id: 'open-d', name: 'Open D (D A D F♯ A D)', strings: [38, 45, 50, 54, 57, 62] },
];

export function noteLabel(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12] ?? '?'}${String(Math.floor(midi / 12) - 1)}`;
}

export function nearestString(
  hz: number,
  tuning: Tuning,
  a4 = 440,
): { index: number; cents: number } | null {
  if (!Number.isFinite(hz) || hz <= 0 || tuning.strings.length === 0) return null;
  let best: { index: number; cents: number } | null = null;
  tuning.strings.forEach((midi, index) => {
    const cents = 1200 * Math.log2(hz / midiToHz(midi, a4));
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) best = { index, cents };
  });
  return best;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
