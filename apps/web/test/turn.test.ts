import { describe, expect, it } from 'vitest';
import { rowsOf, turnTarget } from '../src/score/turn.ts';

const gap = 24;
const fitPages = [0, 1, 2].map((i) => ({ top: 24 + i * 724, height: 700 }));
const tallPages = [0, 1].map((i) => ({ top: 24 + i * 1474, height: 1450 }));
const view = (top: number, height = 748, scrollHeight = 2220) => ({ top, height, scrollHeight });

describe('page turning', () => {
  it('turns from the very top to page 2, not to page 1', () => {
    expect(turnTarget(fitPages, view(0), 1, gap)).toBe(736);
  });

  it('turns forwards and backwards one fitted page at a time', () => {
    expect(turnTarget(fitPages, view(736), 1, gap)).toBe(1460);
    expect(turnTarget(fitPages, view(1460), -1, gap)).toBe(736);
    expect(turnTarget(fitPages, view(736), -1, gap)).toBe(12);
  });

  it('scrolls within a page taller than the screen before leaving it', () => {
    const v = view(0, 700, 3000);
    const first = turnTarget(tallPages, v, 1, gap);
    expect(first).toBe(595);
    const second = turnTarget(tallPages, view(first, 700, 3000), 1, gap);
    expect(second).toBe(786);
    expect(turnTarget(tallPages, view(second, 700, 3000), 1, gap)).toBe(1486);
  });

  it('scrolls back up within a tall page before going to the previous one', () => {
    expect(turnTarget(tallPages, view(1486 + 600, 700, 3000), -1, gap)).toBe(1491);
    expect(turnTarget(tallPages, view(1486, 700, 3000), -1, gap)).toBe(12);
  });

  it('treats two pages side by side as one row', () => {
    const spread = [
      { top: 24, height: 700 },
      { top: 24, height: 700 },
      { top: 764, height: 700 },
      { top: 764, height: 690 },
    ];
    expect(rowsOf(spread)).toEqual([
      { top: 24, height: 700 },
      { top: 764, height: 700 },
    ]);
    expect(turnTarget(spread, view(0, 748, 1500), 1, gap)).toBe(752);
  });

  it('stays inside the scrollable range', () => {
    expect(turnTarget(fitPages, view(1460), 1, gap)).toBe(1472);
    expect(turnTarget(fitPages, view(0), -1, gap)).toBe(0);
    expect(turnTarget([], view(50), 1, gap)).toBe(50);
  });
});
