export const HAND_CHOICES = ['none', 'both', 'right', 'left'] as const;
export type HandChoice = (typeof HAND_CHOICES)[number];

export interface HandLane {
  index: number;
  role: string;
}

export interface LaneState {
  hidden: readonly number[];
  muted: readonly number[];
}

const handOf = (lane: HandLane) =>
  lane.role === 'right' || lane.role === 'left' ? lane.role : null;

export function hasHands(lanes: readonly HandLane[]): boolean {
  return lanes.some((l) => handOf(l) !== null);
}

function mutedBy(choice: HandChoice, hand: 'right' | 'left'): boolean {
  return choice === 'both' || choice === hand;
}

export function applyHandChoice(
  lanes: readonly HandLane[],
  choice: HandChoice,
  state: LaneState,
): { hidden: number[]; muted: number[] } {
  const hands = lanes.filter((l) => handOf(l) !== null);
  const own = new Set(hands.map((l) => l.index));
  return {
    hidden: state.hidden.filter((i) => !own.has(i)),
    muted: [
      ...state.muted.filter((i) => !own.has(i)),
      ...hands
        .filter((l) => mutedBy(choice, l.role === 'left' ? 'left' : 'right'))
        .map((l) => l.index),
    ],
  };
}

export function handChoiceOf(lanes: readonly HandLane[], state: LaneState): HandChoice | 'custom' {
  const hands = lanes.filter((l) => handOf(l) !== null);
  if (hands.some((l) => state.hidden.includes(l.index))) return 'custom';
  const side = (hand: 'right' | 'left'): boolean | null => {
    const mine = hands.filter((l) => l.role === hand);
    const muted = mine.filter((l) => state.muted.includes(l.index)).length;
    if (muted === 0) return false;
    return muted === mine.length ? true : null;
  };
  const right = side('right');
  const left = side('left');
  if (right === null || left === null) return 'custom';
  if (right && left) return 'both';
  if (right) return 'right';
  return left ? 'left' : 'none';
}
