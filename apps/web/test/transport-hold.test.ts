import { describe, expect, it } from 'vitest';
import type { PerfNote } from '../src/music/performance.ts';
import { START_LEAD_SECONDS, Transport } from '../src/music/transport.ts';

const note = (pitch: number, start: number, end: number): PerfNote => ({
  pitch,
  start,
  end,
  staff: 0,
  velocity: 80,
  bar: 0,
  grace: false,
});

const notes = [note(60, 0, 1), note(62, 1, 2), note(64, 2, 3), note(65, 3, 4)];
const lead = START_LEAD_SECONDS;

describe('Transport holding at a limit', () => {
  it('schedules nothing from the limit on, however far ahead it looks', () => {
    const t = new Transport(notes, 4);
    t.limit = () => 2;
    t.play(0);
    expect(t.pump(0, 5, () => true).map((s) => s.note.pitch)).toEqual([60, 62]);
    expect(t.pump(1, 5, () => true)).toEqual([]);
    expect(t.pump(2, 5, () => true)).toEqual([]);
  });

  it('carries on from the limit once it moves, without skipping or repeating a note', () => {
    const t = new Transport(notes, 4);
    let limit: number | null = 2;
    t.limit = () => limit;
    t.play(0);
    const first = t.pump(0, 5, () => true).map((s) => s.note.pitch);
    limit = 3;
    const second = t.pump(2.5, 5, () => true).map((s) => s.note.pitch);
    limit = null;
    const third = t.pump(3.5, 5, () => true).map((s) => s.note.pitch);
    expect([...first, ...second, ...third]).toEqual([60, 62, 64, 65]);
  });

  it('ignores a limit already behind the music rather than freezing it', () => {
    const t = new Transport(notes, 4);
    t.seek(2.5, 0);
    t.limit = () => 1;
    t.play(0);
    expect(t.pump(0, 5, () => true).map((s) => s.note.pitch)).toEqual([65]);
  });

  it('holds a note that starts exactly at the limit back for the resume', () => {
    const t = new Transport(notes, 4);
    t.limit = () => 1;
    t.play(0);
    expect(t.pump(0, 5, () => true).map((s) => s.note.pitch)).toEqual([60]);
    t.pause(1 + lead, 1);
    expect(t.songAt(99)).toBe(1);
    t.limit = () => 2;
    t.play(10);
    expect(t.pump(10, 5, () => true).map((s) => s.note.pitch)).toEqual([62]);
  });

  it('pauses at a given song position rather than wherever the clock has got to', () => {
    const t = new Transport(notes, 4);
    t.play(0);
    t.pause(1.7, 1.25);
    expect(t.songAt(5)).toBe(1.25);
    expect(t.playing).toBe(false);
  });

  it('is running only once the lead-in has passed', () => {
    const t = new Transport(notes, 4);
    expect(t.running(0)).toBe(false);
    t.play(5);
    expect(t.running(5)).toBe(false);
    expect(t.running(5 + lead)).toBe(true);
    const counted = new Transport(notes, 4);
    counted.play(5 + 1.5);
    expect(counted.running(5 + 1.4)).toBe(false);
    expect(counted.running(5 + 1.5 + lead)).toBe(true);
  });

  it('tells its owner when a loop wraps, so the limit can be re-aimed before the next note', () => {
    const t = new Transport(notes, 4);
    t.setLoop({ start: 1, end: 3 }, 0);
    let wraps = 0;
    let limit: number | null = null;
    t.onWrap = () => {
      wraps += 1;
      limit = 1;
    };
    t.limit = () => limit;
    t.play(0);
    const pitches = t.pump(0, 2.5, () => true).map((s) => s.note.pitch);
    expect(wraps).toBe(1);
    expect(pitches).toEqual([62, 64]);
    const next = t.pump(2.5, 2.5, () => true).map((s) => s.note.pitch);
    expect(next).toEqual([]);
    expect(t.songAt(2.5 + lead + 10)).toBeGreaterThanOrEqual(1);
  });
});
