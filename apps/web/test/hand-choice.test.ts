import { describe, expect, it } from 'vitest';
import { applyHandChoice, handChoiceOf, hasHands } from '../src/music/hand-choice.ts';

const hands = [
  { index: 0, role: 'right' },
  { index: 1, role: 'left' },
];
const none = { hidden: [], muted: [] };

describe('the hand you play', () => {
  it('Right mutes the right hand, which stays drawn, and leaves the left to the app', () => {
    expect(applyHandChoice(hands, 'right', none)).toEqual({ hidden: [], muted: [0] });
  });

  it('Left mutes the left hand', () => {
    expect(applyHandChoice(hands, 'left', none)).toEqual({ hidden: [], muted: [1] });
  });

  it('Both mutes both hands; Nothing lets the app play both', () => {
    expect(applyHandChoice(hands, 'both', none)).toEqual({ hidden: [], muted: [0, 1] });
    expect(applyHandChoice(hands, 'none', { hidden: [], muted: [0, 1] })).toEqual(none);
  });

  it('switching from one hand to the other swaps the mute', () => {
    expect(applyHandChoice(hands, 'left', { hidden: [], muted: [0] })).toEqual({
      hidden: [],
      muted: [1],
    });
  });

  it('shows a hidden hand again, since you still follow it on screen', () => {
    expect(applyHandChoice(hands, 'right', { hidden: [0], muted: [] })).toEqual({
      hidden: [],
      muted: [0],
    });
  });

  it('leaves lanes without a hand alone', () => {
    const lanes = [...hands, { index: 2, role: 'single' }];
    expect(applyHandChoice(lanes, 'right', { hidden: [2], muted: [2] })).toEqual({
      hidden: [2],
      muted: [2, 0],
    });
  });

  it('applies to every staff of a hand when a score has several parts', () => {
    const lanes = [
      { index: 0, role: 'right' },
      { index: 1, role: 'left' },
      { index: 2, role: 'right' },
      { index: 3, role: 'left' },
    ];
    expect(applyHandChoice(lanes, 'left', none)).toEqual({ hidden: [], muted: [1, 3] });
    expect(handChoiceOf(lanes, { hidden: [], muted: [1, 3] })).toBe('left');
    expect(handChoiceOf(lanes, { hidden: [], muted: [1] })).toBe('custom');
  });

  it('reads the choice back from the lanes, so the buttons never disagree with them', () => {
    expect(handChoiceOf(hands, none)).toBe('none');
    expect(handChoiceOf(hands, { hidden: [], muted: [0] })).toBe('right');
    expect(handChoiceOf(hands, { hidden: [], muted: [1] })).toBe('left');
    expect(handChoiceOf(hands, { hidden: [], muted: [0, 1] })).toBe('both');
  });

  it('is custom once a hand is hidden by hand', () => {
    expect(handChoiceOf(hands, { hidden: [0], muted: [0] })).toBe('custom');
    expect(handChoiceOf(hands, { hidden: [1], muted: [] })).toBe('custom');
  });

  it('ignores the state of lanes that are not a hand', () => {
    const lanes = [...hands, { index: 2, role: 'single' }];
    expect(handChoiceOf(lanes, { hidden: [2], muted: [2, 0] })).toBe('right');
  });

  it('is only offered where there is a hand to choose', () => {
    expect(hasHands(hands)).toBe(true);
    expect(hasHands([{ index: 0, role: 'right' }])).toBe(true);
    expect(hasHands([{ index: 0, role: 'single' }])).toBe(false);
    expect(hasHands([])).toBe(false);
  });
});
