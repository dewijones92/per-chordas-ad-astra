import { isBlackKey, type KeyRange } from './keys.ts';

export interface KeyRect {
  pitch: number;
  x: number;
  width: number;
  black: boolean;
}

export interface KeyboardLayout {
  keys: KeyRect[];
  byPitch: Map<number, KeyRect>;
  whiteWidth: number;
}

export const BLACK_KEY_RATIO = 0.62;

export function keyboardLayout(range: KeyRange, width: number): KeyboardLayout {
  const whites: number[] = [];
  for (let p = range.low; p <= range.high; p++) if (!isBlackKey(p)) whites.push(p);
  const whiteWidth = width / Math.max(1, whites.length);
  const blackWidth = whiteWidth * BLACK_KEY_RATIO;
  const keys: KeyRect[] = [];
  let whiteIndex = 0;
  for (let p = range.low; p <= range.high; p++) {
    if (isBlackKey(p)) {
      keys.push({
        pitch: p,
        x: whiteIndex * whiteWidth - blackWidth / 2,
        width: blackWidth,
        black: true,
      });
    } else {
      keys.push({ pitch: p, x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
      whiteIndex += 1;
    }
  }
  return { keys, byPitch: new Map(keys.map((k) => [k.pitch, k])), whiteWidth };
}

export function keyForPitch(
  layout: KeyboardLayout,
  pitch: number,
  range: KeyRange,
): KeyRect | undefined {
  const clamped = Math.min(range.high, Math.max(range.low, pitch));
  return (
    layout.byPitch.get(clamped) ??
    layout.byPitch.get(clamped + 1) ??
    layout.byPitch.get(clamped - 1)
  );
}
