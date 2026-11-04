import { describe, expect, it } from 'vitest';
import { assignHands, handLanes, LEFT_OUT, thinOctaves } from '../src/music/hands.ts';
import type { PerfNote } from '../src/music/performance.ts';
import {
  CHORD_WINDOW_MS,
  EARLY_SECONDS,
  playerLanes,
  WaitSession,
  waitTargets,
} from '../src/music/wait-for-me.ts';

const note = (pitch: number, start: number, staff = 0): PerfNote => ({
  pitch,
  start,
  end: start + 0.4,
  staff,
  velocity: 80,
  bar: 0,
  grace: false,
});

const everything = () => true;

describe('who plays what', () => {
  it('has you play every shown lane when nothing is muted', () => {
    expect([...playerLanes([0, 1], [], [])]).toEqual([0, 1]);
  });

  it('has you play only the muted lanes when some are muted, so the app keeps the rest', () => {
    expect([...playerLanes([0, 1], [], [1])]).toEqual([1]);
  });

  it('leaves a hidden lane to the app, even when it is muted', () => {
    expect([...playerLanes([0, 1], [0], [])]).toEqual([1]);
    expect([...playerLanes([0, 1], [1], [1])]).toEqual([0]);
  });

  it('never asks for notes the thin-octaves filter left out', () => {
    expect([...playerLanes([0, 1, LEFT_OUT], [], [])]).toEqual([0, 1]);
  });
});

describe('the notes to wait for', () => {
  it('groups notes that start together into one chord, lowest first, without duplicates', () => {
    const targets = waitTargets(
      [note(64, 0), note(60, 0.01), note(60, 0, 1), note(67, 0.5)],
      everything,
      0,
    );
    expect(targets).toEqual([
      { at: 0, pitches: [60, 64] },
      { at: 0.5, pitches: [67] },
    ]);
  });

  it('asks for the sounding pitch after transposing', () => {
    expect(waitTargets([note(60, 0), note(64, 0)], everything, 2)).toEqual([
      { at: 0, pitches: [62, 66] },
    ]);
    expect(waitTargets([note(60, 0)], everything, -5)).toEqual([{ at: 0, pitches: [55] }]);
  });

  it('skips notes that are not yours, and a moment with none of yours', () => {
    const notes = [note(60, 0, 0), note(40, 0, 1), note(41, 0.5, 1), note(62, 1, 0)];
    const mine = (n: PerfNote) => n.staff === 0;
    expect(waitTargets(notes, mine, 0)).toEqual([
      { at: 0, pitches: [60] },
      { at: 1, pitches: [62] },
    ]);
  });
});

describe('with the hands split and thin octaves on', () => {
  const names = { right: 'Right', left: 'Left' };

  function targetsFor(hidden: number[], muted: number[]) {
    const lower = note(57, 0);
    const upper = note(69, 0);
    const bass = note(43, 0);
    const later = [note(60, 0.5), note(64, 0.5)];
    const all = [bass, lower, upper, ...later];
    const left = thinOctaves(all);
    const kept = all.filter((n) => !left.has(n));
    const lanes = handLanes(assignHands(kept), names, names);
    const mine = playerLanes(
      lanes.lanes.map((l) => l.index),
      hidden,
      muted,
    );
    return {
      lower,
      lanes,
      targets: waitTargets(all, (n) => mine.has(lanes.laneOf(n)), 0),
    };
  }

  it('never waits for the lower copy of an octave that was thinned out', () => {
    const { lower, lanes, targets } = targetsFor([], []);
    expect(lanes.laneOf(lower)).toBe(LEFT_OUT);
    expect(targets.flatMap((t) => t.pitches)).not.toContain(57);
    expect(targets[0]?.pitches).toEqual([43, 69]);
  });

  it('waits only for the right hand when the left hand is hidden, and the left when it is muted', () => {
    expect(targetsFor([1], []).targets.flatMap((t) => t.pitches)).not.toContain(43);
    const muted = targetsFor([], [1]).targets.flatMap((t) => t.pitches);
    expect(muted).toContain(43);
    expect(muted).not.toContain(69);
  });
});

describe('waiting at a note', () => {
  const session = (): WaitSession => {
    const s = new WaitSession();
    s.setTargets(
      [
        { at: 1, pitches: [60] },
        { at: 2, pitches: [60, 64, 67] },
        { at: 3, pitches: [72] },
      ],
      0,
      0,
    );
    return s;
  };

  it('holds the music at the next target and moves on when its key is pressed', () => {
    const s = session();
    expect(s.limit()).toBe(1);
    s.arrive(1000);
    expect(s.waiting).toBe(true);
    expect(s.remaining()).toEqual([60]);
    expect(s.press(60, 1500, 1)).toEqual({ kind: 'correct', done: true });
    expect(s.waiting).toBe(false);
    expect(s.limit()).toBe(2);
    expect(s.snapshot(1500)).toMatchObject({ targets: 1, notes: 1, right: 1, wrong: 0 });
    expect(s.snapshot(1500).waitedMs).toBe(500);
  });

  it('needs every key of a chord, in any order', () => {
    const s = session();
    s.jumpTo(2, 0);
    s.arrive(0);
    expect(s.press(67, 10, 2)).toEqual({ kind: 'correct', done: false });
    expect(s.remaining()).toEqual([60, 64]);
    expect(s.press(60, 20, 2)).toEqual({ kind: 'correct', done: false });
    expect(s.press(64, 30, 2)).toEqual({ kind: 'correct', done: true });
    expect(s.limit()).toBe(3);
  });

  it('lets go of a chord key pressed too long ago, so the chord must be played together', () => {
    const s = session();
    s.jumpTo(2, 0);
    s.arrive(0);
    s.press(60, 0, 2);
    s.press(64, 100, 2);
    s.release(60);
    s.release(64);
    expect(s.press(67, CHORD_WINDOW_MS + 200, 2)).toEqual({ kind: 'correct', done: false });
    expect(s.remaining()).toEqual([60, 64]);
  });

  it('counts a chord key that is still held down, however long ago it was pressed', () => {
    const s = session();
    s.jumpTo(2, 0);
    s.arrive(0);
    s.press(60, 0, 2);
    s.press(64, CHORD_WINDOW_MS + 500, 2);
    expect(s.remaining()).toEqual([67]);
    expect(s.press(67, CHORD_WINDOW_MS + 600, 2)).toEqual({ kind: 'correct', done: true });
  });

  it('forgets a chord key once it is let go and the window has passed', () => {
    const s = session();
    s.jumpTo(2, 0);
    s.arrive(0);
    s.press(60, 0, 2);
    s.release(60);
    s.press(64, CHORD_WINDOW_MS + 500, 2);
    expect(s.remaining()).toEqual([60, 67]);
  });

  it('counts a wrong key without moving on, and the note is then not right first time', () => {
    const s = session();
    s.arrive(0);
    expect(s.press(61, 100, 1)).toEqual({ kind: 'wrong' });
    expect(s.press(62, 200, 1)).toEqual({ kind: 'wrong' });
    expect(s.waiting).toBe(true);
    expect(s.limit()).toBe(1);
    expect(s.press(60, 300, 1)).toEqual({ kind: 'correct', done: true });
    expect(s.snapshot(300)).toMatchObject({ notes: 1, right: 0, wrong: 2 });
  });

  it('counts the right notes of a chord only when no wrong key came first', () => {
    const s = session();
    s.jumpTo(2, 0);
    s.arrive(0);
    s.press(61, 10, 2);
    s.press(60, 20, 2);
    s.press(64, 30, 2);
    s.press(67, 40, 2);
    expect(s.snapshot(40)).toMatchObject({ targets: 1, notes: 3, right: 0, wrong: 1 });
    s.arrive(100);
    s.press(72, 150, 3);
    expect(s.snapshot(150)).toMatchObject({ targets: 2, notes: 4, right: 1 });
  });

  it('accepts a key a little before the music arrives, so a good player never waits', () => {
    const s = session();
    expect(s.press(60, 100, 1 - EARLY_SECONDS / 2)).toEqual({ kind: 'correct', done: true });
    expect(s.waiting).toBe(false);
    expect(s.snapshot(100).waitedMs).toBe(0);
    s.arrive(500);
    expect(s.limit()).toBe(2);
  });

  it('ignores keys when the next note is still far away, and does not count them wrong', () => {
    const s = session();
    expect(s.press(99, 0, 0)).toEqual({ kind: 'ignored', why: 'too-early' });
    expect(s.snapshot(0).wrong).toBe(0);
  });

  it('ignores keys once there is nothing left to play', () => {
    const s = session();
    s.jumpTo(10, 0);
    expect(s.limit()).toBeNull();
    expect(s.press(60, 0, 10)).toEqual({ kind: 'ignored', why: 'nothing-to-play' });
    s.arrive(0);
    expect(s.waiting).toBe(false);
  });

  it('starts again from a loop start or a seek, forgetting a half-played chord', () => {
    const s = session();
    s.jumpTo(2, 0);
    s.arrive(0);
    s.press(60, 0, 2);
    s.jumpTo(1, 50);
    expect(s.limit()).toBe(1);
    expect(s.waiting).toBe(false);
    expect(s.snapshot(50).waitedMs).toBe(50);
    s.jumpTo(2, 60);
    s.arrive(60);
    expect(s.remaining()).toEqual([60, 64, 67]);
  });

  it('keeps counting across a loop wrap, and keeps the time waited when paused mid-wait', () => {
    const s = session();
    s.arrive(1000);
    s.suspend(1400);
    expect(s.snapshot(9000).waitedMs).toBe(400);
    s.arrive(2000);
    expect(s.snapshot(2100).waitedMs).toBe(500);
    s.press(60, 2200, 1);
    expect(s.snapshot(2200).waitedMs).toBe(600);
  });

  it('keeps its stats when the notes it waits for change, and clears them on reset', () => {
    const s = session();
    s.arrive(0);
    s.press(60, 100, 1);
    s.setTargets([{ at: 1, pitches: [62] }], 1, 200);
    expect(s.snapshot(200)).toMatchObject({ targets: 1, right: 1 });
    s.finish(300);
    expect(s.finished).toBe(true);
    s.reset();
    expect(s.finished).toBe(false);
    expect(s.snapshot(300)).toEqual({ targets: 0, notes: 0, right: 0, wrong: 0, waitedMs: 0 });
  });
});
