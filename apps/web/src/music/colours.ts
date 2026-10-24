import type { ScoreStaff } from './model.ts';

export interface StaffColour {
  fill: string;
  edge: string;
  glow: string;
}

const RIGHT: StaffColour = { fill: '#6d3df2', edge: '#4b22c9', glow: '#ece5ff' };
const LEFT: StaffColour = { fill: '#13b9a6', edge: '#0b7f72', glow: '#d9f7f2' };
const OTHERS: readonly StaffColour[] = [
  { fill: '#ff5d73', edge: '#c9384c', glow: '#ffe6ea' },
  { fill: '#3a8dff', edge: '#1f62c4', glow: '#dcebff' },
  { fill: '#f0a500', edge: '#a87300', glow: '#fff3cf' },
  RIGHT,
  LEFT,
];

export function staffColours(staves: readonly ScoreStaff[]): StaffColour[] {
  let other = 0;
  const twoHands = staves.some((s) => s.role === 'left');
  return staves.map((s) => {
    if (twoHands && s.role === 'right') return RIGHT;
    if (twoHands && s.role === 'left') return LEFT;
    const colour = OTHERS[other % OTHERS.length] ?? RIGHT;
    other += 1;
    return colour;
  });
}
