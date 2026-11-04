import { HAND_COLOURS, type StaffColour } from './colours.ts';
import { fingerOf, keyUpAt } from './falling.ts';
import {
  buildHandTimeline,
  FINGERS,
  newPose,
  whiteUnits,
  type HandLayer,
  type HandNote,
  type HandSide,
} from './hand-pose.ts';
import type { KeyRange } from './keys.ts';
import type { PerfNote } from './performance.ts';

export interface HandsInput {
  notes: readonly PerfNote[];
  hidden: ReadonlySet<number>;
  laneOf: (n: PerfNote) => number;
  sideOf: (n: PerfNote) => HandSide;
  userFingers: ReadonlyMap<string, string>;
  suggested: ReadonlyMap<PerfNote, number> | null;
  transpose: number;
  range: KeyRange;
  tails: boolean;
  colourOf: (side: HandSide) => StaffColour;
}

export function fingerDigit(text: string): number | null {
  const digit = /[1-5]/.exec(text)?.[0];
  return digit === undefined ? null : Number(digit);
}

export function handColourOf(
  side: HandSide,
  lanes: readonly { role: string }[],
  colours: readonly StaffColour[],
): StaffColour {
  const at = lanes.findIndex((l) => l.role === side);
  const found = at >= 0 ? colours[at] : undefined;
  if (found) return found;
  return HAND_COLOURS[side];
}

export function handLayers(input: HandsInput): HandLayer[] {
  const started = performance.now();
  const unitOf = whiteUnits(input.range);
  const bySide: Record<HandSide, HandNote[]> = { right: [], left: [] };
  let unfingered = 0;
  for (const n of input.notes) {
    if (input.hidden.has(input.laneOf(n))) continue;
    const given = fingerOf(n, input.userFingers, input.suggested ?? undefined);
    const finger = given ? fingerDigit(given.text) : null;
    if (finger === null) {
      unfingered += 1;
      continue;
    }
    const pitch = n.pitch + input.transpose;
    bySide[input.sideOf(n)].push({
      pitch,
      u: unitOf(pitch),
      start: n.start,
      end: keyUpAt(n, input.tails),
      finger,
    });
  }
  const layers: HandLayer[] = [];
  for (const side of ['right', 'left'] as const) {
    const timeline = buildHandTimeline(bySide[side], side);
    if (timeline)
      layers.push({
        side,
        timeline,
        colour: input.colourOf(side),
        pose: newPose(),
        x: new Float64Array(FINGERS),
      });
  }
  console.info('dewidebug hands built', {
    right: bySide.right.length,
    left: bySide.left.length,
    unfingered,
    drawn: layers.map((l) => l.side),
    ms: Math.round(performance.now() - started),
  });
  return layers;
}
