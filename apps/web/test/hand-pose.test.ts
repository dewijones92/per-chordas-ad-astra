import { describe, expect, it } from 'vitest';
import {
  buildHandTimeline,
  newPose,
  poseAt,
  whiteUnits,
  type HandNote,
  type HandSide,
} from '../src/music/hand-pose.ts';

const RANGE = { low: 36, high: 96 };
const unit = whiteUnits(RANGE);

const hn = (pitch: number, start: number, end: number, finger: number): HandNote => ({
  pitch,
  u: unit(pitch),
  start,
  end,
  finger,
});

function pose(notes: HandNote[], side: HandSide, t: number) {
  const timeline = buildHandTimeline(notes, side);
  if (!timeline) throw new Error('no timeline');
  const out = newPose();
  poseAt(timeline, t, out);
  return { u: [...out.u], dip: [...out.dip], alpha: out.alpha };
}

const scale = () =>
  [60, 62, 64, 65, 67, 69, 71, 72].map((p, i) =>
    hn(p, i * 0.5, i * 0.5 + 0.5, [1, 2, 3, 1, 2, 3, 4, 5][i] ?? 1),
  );

describe('a hand playing', () => {
  it('whiteUnits counts one per white key and puts a black key between its neighbours', () => {
    expect(unit(62) - unit(60)).toBeCloseTo(1, 5);
    expect(unit(72) - unit(60)).toBeCloseTo(7, 5);
    expect(unit(61)).toBeCloseTo((unit(60) + unit(62)) / 2, 5);
  });

  it('puts the pressing finger over its key and dips it, with the others resting', () => {
    const p = pose(scale(), 'right', 1.2);
    expect(p.u[2]).toBeCloseTo(unit(64), 5);
    expect(p.dip[2]).toBe(1);
    expect(p.dip.filter((d) => d > 0)).toHaveLength(1);
  });

  it('keeps the fingers in order, one white key apart, when the hand is at rest', () => {
    const p = pose(scale(), 'right', 1.05);
    for (let f = 1; f < 5; f++) expect((p.u[f] ?? 0) - (p.u[f - 1] ?? 0)).toBeCloseTo(1, 5);
  });

  it('presses at exactly an onset but not before the finger starts to drop', () => {
    expect(pose(scale(), 'right', 1).dip[2]).toBe(1);
    expect(pose(scale(), 'right', 0.9).dip[2]).toBe(0);
    expect(pose(scale(), 'right', 1.1).dip[2]).toBe(1);
  });

  it('lifts again after the note ends', () => {
    const p = pose([hn(60, 0, 0.4, 1), hn(72, 5, 5.4, 1)], 'right', 1);
    expect(p.dip[0]).toBe(0);
  });

  it('passes the thumb under finger 3 on the way to F, then lands with the hand in order', () => {
    const before = pose(scale(), 'right', 1.2);
    expect(before.u[0]).toBeLessThan(before.u[2] ?? 0);
    let crossed = false;
    for (let t = 1.0; t < 1.5; t += 0.01) {
      const p = pose(scale(), 'right', t);
      if ((p.u[0] ?? 0) > (p.u[2] ?? 0) && (p.dip[2] ?? 0) > 0) crossed = true;
    }
    expect(crossed).toBe(true);
    const landed = pose(scale(), 'right', 1.5);
    expect(landed.u[0]).toBeCloseTo(unit(65), 5);
    expect(landed.dip[0]).toBe(1);
    for (let f = 1; f < 5; f++) expect(landed.u[f] ?? 0).toBeGreaterThan(landed.u[f - 1] ?? 0);
  });

  it('presses a chord with its fingers at once and rests the others between them', () => {
    const chord = [hn(60, 0, 1, 1), hn(64, 0, 1, 3), hn(67, 0, 1, 5)];
    const p = pose(chord, 'right', 0.5);
    expect(p.dip).toEqual([1, 0, 1, 0, 1]);
    expect(p.u[0]).toBeCloseTo(unit(60), 5);
    expect(p.u[2]).toBeCloseTo(unit(64), 5);
    expect(p.u[4]).toBeCloseTo(unit(67), 5);
    expect(p.u[1]).toBeCloseTo(((p.u[0] ?? 0) + (p.u[2] ?? 0)) / 2, 5);
    expect(p.u[3]).toBeCloseTo(((p.u[2] ?? 0) + (p.u[4] ?? 0)) / 2, 5);
  });

  it('spreads the fingers for a stretch instead of crossing them', () => {
    const wide = pose([hn(60, 0, 1, 1), hn(72, 0, 1, 5)], 'right', 0.5);
    for (let f = 1; f < 5; f++) expect(wide.u[f] ?? 0).toBeGreaterThan(wide.u[f - 1] ?? 0);
    expect((wide.u[4] ?? 0) - (wide.u[0] ?? 0)).toBeCloseTo(7, 5);
  });

  it('keeps a held note under its finger while the others move on', () => {
    const notes = [hn(48, 0, 3, 5), hn(55, 1, 1.5, 2), hn(58, 2, 2.5, 1)];
    for (const t of [0.5, 1.2, 1.7, 2.2, 2.9]) {
      const p = pose(notes, 'right', t);
      expect(p.u[4]).toBeCloseTo(unit(48), 5);
      expect(p.dip[4]).toBe(1);
    }
  });

  it('moves the whole hand ahead of a jump, before the note is due', () => {
    const jump = [hn(60, 0, 0.3, 1), hn(72, 3, 3.3, 1)];
    expect(pose(jump, 'right', 1).u[0]).toBeCloseTo(unit(60), 5);
    const early = pose(jump, 'right', 2.8);
    expect(early.u[0] ?? 0).toBeGreaterThan(unit(60) + 1);
    expect(early.u[0] ?? 0).toBeLessThan(unit(72));
    expect(early.u[4] ?? 0).toBeGreaterThan(unit(60) + 5);
    expect(early.dip[0]).toBe(0);
    expect(pose(jump, 'right', 3).u[0]).toBeCloseTo(unit(72), 5);
  });

  it('mirrors the left hand: the thumb is the highest finger', () => {
    const p = pose([hn(48, 0, 1, 5), hn(55, 0, 1, 1)], 'left', 0.5);
    expect(p.u[0]).toBeCloseTo(unit(55), 5);
    expect(p.u[4]).toBeCloseTo(unit(48), 5);
    for (let f = 1; f < 5; f++) expect(p.u[f] ?? 0).toBeLessThan(p.u[f - 1] ?? 0);
    expect(p.dip).toEqual([1, 0, 0, 0, 1]);
  });

  it('rests the left hand down the keyboard from where its thumb plays', () => {
    const p = pose([hn(60, 0, 1, 1)], 'left', 0.5);
    expect(p.u[4] ?? 0).toBeCloseTo(unit(60) - 4, 5);
  });

  it('relaxes and fades through a long gap and is back at full strength before the next note', () => {
    const notes = [hn(60, 0, 0.5, 1), hn(64, 10, 10.5, 1)];
    expect(pose(notes, 'right', 0.2).alpha).toBe(1);
    expect(pose(notes, 'right', 5).alpha).toBeLessThan(0.5);
    expect(pose(notes, 'right', 9.9).alpha).toBe(1);
  });

  it('waits at the first position before the first note and at the last after it', () => {
    const notes = [hn(60, 4, 4.5, 1), hn(64, 5, 5.5, 3)];
    expect(pose(notes, 'right', 0).u[0]).toBeCloseTo(unit(60), 5);
    expect(pose(notes, 'right', 0).dip).toEqual([0, 0, 0, 0, 0]);
    expect(pose(notes, 'right', 50).u[2]).toBeCloseTo(unit(64), 5);
  });

  it('has nothing to build for a hand with no fingered notes', () => {
    expect(buildHandTimeline([], 'right')).toBeNull();
    expect(buildHandTimeline([hn(60, 0, 1, 0)], 'right')).toBeNull();
  });
});
