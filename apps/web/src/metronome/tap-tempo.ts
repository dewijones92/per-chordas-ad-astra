export const TAP_RESET_MS = 2000;
const WINDOW = 4;

export function tapTempo(
  taps: readonly number[],
  at: number,
): { taps: number[]; bpm: number | null } {
  const last = taps.at(-1);
  const kept = last !== undefined && at - last <= TAP_RESET_MS ? [...taps, at] : [at];
  const recent = kept.slice(-(WINDOW + 1));
  if (recent.length < 2) return { taps: recent, bpm: null };
  const first = recent[0] ?? at;
  const average = (at - first) / (recent.length - 1);
  return { taps: recent, bpm: Math.round(60_000 / average) };
}
