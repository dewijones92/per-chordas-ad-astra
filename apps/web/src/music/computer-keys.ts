const OFFSETS: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
};

export const DEFAULT_BASE = 60;
export const LOWEST_BASE = 24;
export const HIGHEST_BASE = 96;
export const KEY_COUNT = 12;

export function computerKeyPitch(code: string, base: number): number | null {
  const offset = OFFSETS[code];
  return offset === undefined ? null : base + offset;
}

export function octaveShiftOf(code: string): -1 | 1 | null {
  if (code === 'KeyZ') return -1;
  if (code === 'KeyX') return 1;
  return null;
}

export function shiftBase(base: number, direction: -1 | 1): number {
  return Math.min(HIGHEST_BASE, Math.max(LOWEST_BASE, base + direction * 12));
}

export function computerKeyRange(base: number): [number, number] {
  return [base, base + KEY_COUNT - 1];
}
