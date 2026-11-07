import { makeMscx, PIANO_WALTZ, type FixtureScore } from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import {
  GROOVES,
  MetronomeSettings as SettingsSchema,
  perBeatOf,
  SettingsFile,
  type Groove,
} from '@pcaa/shared';
import {
  ACCENT_GAIN,
  countInHits,
  drumHits,
  GROOVE_SPECS,
  grooveForMeter,
  hitSeconds,
  pickGroove,
  type DrumVoice,
} from '../src/drums/grooves.ts';
import { playDrum } from '../src/drums/voices.ts';
import {
  AUTO_GAP_SECONDS,
  autoLevel,
  clickIsHeard,
  hitsForClick,
  hitsPerBeat,
  levelAt,
  timeHits,
} from '../src/music/click-hits.ts';
import { parseScoreText } from '../src/music/load.ts';
import { buildPerformance } from '../src/music/performance.ts';
import {
  defaultSettings,
  TickScheduler,
  type MetronomeSettings,
  type Subdivision,
} from '../src/metronome/scheduler.ts';
import { loadSettings, reconcile } from '../src/metronome/settings-store.ts';

const LETTER: Record<DrumVoice, string> = {
  kick: 'K',
  snare: 'S',
  rim: 'R',
  hat: 'h',
  openHat: 'O',
  ride: 'r',
};

const settings = (over: Partial<MetronomeSettings> = {}): MetronomeSettings => ({
  ...defaultSettings(),
  sound: 'drums',
  ...over,
});

function bar(groove: Groove, subdivision: Subdivision, accentFirstBeat = true): string[] {
  const s = settings({
    groove,
    subdivision,
    beatsPerBar: GROOVE_SPECS[groove].beats,
    accentFirstBeat,
    bpm: 60,
  });
  return new TickScheduler(s, 0).until(GROOVE_SPECS[groove].beats).flatMap((tick) => {
    const hits = drumHits(
      groove,
      { beat: tick.beat, sub: tick.sub, subdivision },
      tick.kind === 'bar',
    );
    const tokens = hits.map(
      (h) => LETTER[h.voice] + (h.twelfths > 0 ? `@${String(h.twelfths)}` : ''),
    );
    return [tokens.sort().join('+')];
  });
}

describe('which drum hits land on which tick', () => {
  it('rock/pop: kick on 1 and 3 with a kick on the and of 3, snare on 2 and 4, a hat on every tick', () => {
    expect(bar('rock', 1)).toEqual(['K+h', 'S+h', 'K+K@6+h', 'S+h']);
    expect(bar('rock', 2)).toEqual(['K+h', 'h', 'S+h', 'h', 'K+h', 'K+h', 'S+h', 'h']);
    expect(bar('rock', 3)).toEqual([
      ...['K+h', 'h', 'h'],
      ...['S+h', 'h', 'h'],
      ...['K+h', 'K@2+h', 'h'],
      ...['S+h', 'h', 'h'],
    ]);
    expect(bar('rock', 4)).toEqual([
      ...['K+h', 'h', 'h', 'h'],
      ...['S+h', 'h', 'h', 'h'],
      ...['K+h', 'h', 'K+h', 'h'],
      ...['S+h', 'h', 'h', 'h'],
    ]);
  });

  it('ballad: kick on 1 and a soft kick on the and of 3, side stick on 2 and 4', () => {
    expect(bar('ballad', 1)).toEqual(['K+h', 'R+h', 'K@6+h', 'R+h']);
    expect(bar('ballad', 2)).toEqual(['K+h', 'h', 'R+h', 'h', 'h', 'K+h', 'R+h', 'h']);
  });

  it('waltz: kick on 1, snare chips on 2 and 3, over three beats', () => {
    expect(bar('waltz', 1)).toEqual(['K+h', 'S+h', 'S+h']);
    expect(bar('waltz', 2)).toEqual(['K+h', 'h', 'S+h', 'h', 'S+h', 'h']);
    expect(bar('waltz', 3)).toEqual([
      ...['K+h', 'h', 'h'],
      ...['S+h', 'h', 'h'],
      ...['S+h', 'h', 'h'],
    ]);
  });

  it('6/8: six eighth-note beats, kick on 1, snare on 4, an open hat in place of the last hat', () => {
    expect(bar('sixeight', 1)).toEqual(['K+h', 'h', 'h', 'S+h', 'h', 'O']);
    expect(bar('sixeight', 2)).toEqual([
      ...['K+h', 'h'],
      ...['h', 'h'],
      ...['h', 'h'],
      ...['S+h', 'h'],
      ...['h', 'h'],
      ...['O', 'h'],
    ]);
  });

  it('swing: a ride that is swung at 2 and shuffled at 3, a hat chick on 2 and 4', () => {
    expect(bar('swing', 1)).toEqual(['K+r', 'h+r', 'K+r', 'h+r']);
    expect(bar('swing', 2)).toEqual([
      ...['K+r', 'r@2'],
      ...['h+r', 'r@2'],
      ...['K+r', 'r@2'],
      ...['h+r', 'r@2'],
    ]);
    expect(bar('swing', 3)).toEqual([
      ...['K+r', '', 'r'],
      ...['h+r', '', 'r'],
      ...['K+r', '', 'r'],
      ...['h+r', '', 'r'],
    ]);
    expect(bar('swing', 4)).toEqual([
      ...['K+r', 'r', 'r', 'r'],
      ...['h+r', 'r', 'r', 'r'],
      ...['K+r', 'r', 'r', 'r'],
      ...['h+r', 'r', 'r', 'r'],
    ]);
  });

  it('bossa nova: the kick lilts on 1, 2-and, 3, 4-and over a rim clave and steady hats', () => {
    expect(bar('bossa', 1)).toEqual(['K+R+h', 'K@6+R@6+h', 'K+h', 'K@6+R+h']);
    expect(bar('bossa', 2)).toEqual(['K+R+h', 'h', 'h', 'K+R+h', 'K+h', 'h', 'R+h', 'K+h']);
  });

  it('puts every hit somewhere in the bar at every subdivision, with levels in range', () => {
    for (const groove of GROOVES) {
      for (const subdivision of [1, 2, 3, 4] as const) {
        const ticks = bar(groove, subdivision);
        const spec = GROOVE_SPECS[groove];
        expect(ticks, `${groove} ${String(subdivision)}`).toHaveLength(spec.beats * subdivision);
        const kicks = ticks.join('+').match(/K/g) ?? [];
        expect(kicks.length, `${groove} ${String(subdivision)} kicks`).toBe(
          spec.hits.filter((h) => h.voice === 'kick').length,
        );
        for (const accent of [false, true]) {
          for (let beat = 0; beat < spec.beats; beat++) {
            for (let sub = 0; sub < subdivision; sub++) {
              for (const h of drumHits(groove, { beat, sub, subdivision }, accent)) {
                expect(h.level).toBeGreaterThan(0);
                expect(h.level).toBeLessThanOrEqual(1);
                expect(h.twelfths).toBeGreaterThanOrEqual(0);
                expect(h.twelfths).toBeLessThan(12);
              }
            }
          }
        }
      }
    }
  });

  it('swings the ride only at 2 (late) and 3 (the middle triplet stays silent)', () => {
    const rides = (subdivision: Subdivision) =>
      bar('swing', subdivision).filter((t) => t.includes('r')).length;
    expect(rides(1)).toBe(4);
    expect(rides(2)).toBe(8);
    expect(rides(3)).toBe(8);
    expect(rides(4)).toBe(16);
  });
});

describe('accent', () => {
  it('lifts the hits on the first beat when the accent is on, and leaves the rest alone', () => {
    const slot = { beat: 0, sub: 0, subdivision: 1 as const };
    const plain = drumHits('rock', slot, false);
    const accented = drumHits('rock', slot, true);
    expect(accented.map((h) => h.level)).toEqual(plain.map((h) => h.level * ACCENT_GAIN));
    expect(accented.map((h) => h.voice)).toEqual(plain.map((h) => h.voice));
  });

  it('follows the scheduler: accentFirstBeat off leaves every beat at its own level', () => {
    const level = (accentFirstBeat: boolean) => {
      const tick = new TickScheduler(settings({ accentFirstBeat }), 0).next();
      const hits = drumHits(
        'rock',
        { beat: tick.beat, sub: tick.sub, subdivision: 1 },
        tick.kind === 'bar',
      );
      return hits.find((h) => h.voice === 'kick')?.level;
    };
    expect(level(true)).toBeCloseTo(1);
    expect(level(false)).toBeCloseTo(0.8);
  });
});

describe('picking a groove, and beats that do not match it', () => {
  it('sets the beats per bar to the groove’s own meter', () => {
    expect(pickGroove('waltz')).toEqual({ groove: 'waltz', beatsPerBar: 3 });
    expect(pickGroove('sixeight')).toEqual({ groove: 'sixeight', beatsPerBar: 6 });
    expect(pickGroove('rock')).toEqual({ groove: 'rock', beatsPerBar: 4 });
    expect(GROOVES.map((g) => pickGroove(g).beatsPerBar)).toEqual([4, 4, 3, 6, 4, 4]);
  });

  it('repeats the groove by its own length when the bar is longer, and cuts it short when shorter', () => {
    const at = (groove: Groove, beat: number) =>
      drumHits(groove, { beat, sub: 0, subdivision: 1 }, false).map((h) => h.voice);
    expect(at('waltz', 3)).toEqual(at('waltz', 0));
    expect(at('waltz', 4)).toEqual(at('waltz', 1));
    expect(at('rock', 6)).toEqual(at('rock', 2));
    expect(at('rock', 1)).toEqual(['snare', 'hat']);
  });
});

describe('drums keep the scheduler drift-free', () => {
  it('places every swung ride exactly, an hour in, at an awkward tempo', () => {
    const bpm = 97;
    const s = settings({ groove: 'swing', subdivision: 2, bpm });
    const ticks = new TickScheduler(s, 0).until(3600);
    expect(ticks).toHaveLength(bpm * 60 * 2);
    let swung = 0;
    ticks.forEach((tick, i) => {
      for (const h of drumHits(
        'swing',
        { beat: tick.beat, sub: tick.sub, subdivision: 2 },
        false,
      )) {
        if (h.voice !== 'ride' || h.twelfths === 0) continue;
        swung += 1;
        const when = tick.time + hitSeconds(h, tick.bpm);
        expect(when).toBeCloseTo(((Math.floor(i / 2) + 8 / 12) * 60) / bpm, 6);
      }
    });
    expect(swung).toBe(bpm * 60);
  });

  it('keeps the speed trainer working: later bars are the same groove at a faster pace', () => {
    const trainer = { enabled: true, stepBpm: 60, everyBars: 1, maxBpm: 240 };
    const ticks = new TickScheduler(
      settings({ groove: 'waltz', beatsPerBar: 3, bpm: 60, trainer }),
      0,
    ).until(4.4);
    const kicks = ticks.filter((t) =>
      drumHits('waltz', { beat: t.beat, sub: t.sub, subdivision: 1 }, true).some(
        (h) => h.voice === 'kick',
      ),
    );
    expect(kicks.map((t) => [t.bar, t.bpm])).toEqual([
      [0, 60],
      [1, 120],
    ]);
  });
});

describe('settings that predate drums', () => {
  const old = {
    bpm: 90,
    beatsPerBar: 4,
    subdivision: 2,
    accentFirstBeat: true,
    trainer: { enabled: false, stepBpm: 5, everyBars: 4, maxBpm: 160 },
  };

  it('parse with a click and the rock groove', () => {
    expect(SettingsSchema.parse(old)).toMatchObject({ sound: 'click', groove: 'rock' });
    const file = SettingsFile.parse({ metronome: old, updatedAt: '2026-10-14T10:00:00.000Z' });
    expect(file.metronome).toMatchObject({ sound: 'click', groove: 'rock' });
  });

  it('keep the drum choice once saved, and refuse a groove that does not exist', () => {
    expect(SettingsSchema.parse({ ...old, sound: 'drums', groove: 'bossa' })).toMatchObject({
      sound: 'drums',
      groove: 'bossa',
    });
    expect(SettingsSchema.safeParse({ ...old, groove: 'polka' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...old, sound: 'bongos' }).success).toBe(false);
  });

  it('read from this browser with defaults filled in, and a bad groove falls back to rock', () => {
    localStorage.setItem('pcaa.metronome.v2', JSON.stringify({ settings: old, at: 7 }));
    expect(loadSettings().settings).toMatchObject({ sound: 'click', groove: 'rock', bpm: 90 });
    localStorage.setItem(
      'pcaa.metronome.v2',
      JSON.stringify({ settings: { ...old, sound: 'bongos', groove: 'polka' }, at: 7 }),
    );
    expect(loadSettings().settings).toMatchObject({ sound: 'click', groove: 'rock' });
    localStorage.clear();
  });

  it('are not pushed again just because the repo copy lacks the new fields', () => {
    const remote = SettingsFile.parse({ metronome: old, updatedAt: new Date(5000).toISOString() });
    const decision = reconcile({ settings: SettingsSchema.parse(old), at: 5000 }, remote, 9000);
    expect(decision).toEqual({ kind: 'none', why: 'already in step' });
  });
});

describe('the play-along beat as drums', () => {
  it('picks a groove from the meter: three beats waltz, two dotted beats 6/8, anything else rock', () => {
    expect(grooveForMeter(3, false)).toBe('waltz');
    expect(grooveForMeter(2, true)).toBe('sixeight');
    expect(grooveForMeter(4, false)).toBe('rock');
    expect(grooveForMeter(2, false)).toBe('rock');
    expect(grooveForMeter(4, true)).toBe('rock');
    expect(grooveForMeter(5, false)).toBe('rock');
  });

  it('counts the bar in with side sticks and a hat, the first beat louder', () => {
    const first = countInHits(true);
    const rest = countInHits(false);
    expect(first.map((h) => h.voice)).toEqual(['rim', 'hat']);
    expect(rest.map((h) => h.voice)).toEqual(['rim', 'hat']);
    first.forEach((h, i) => {
      expect(h.level).toBeGreaterThan(rest[i]?.level ?? 1);
      expect(h.level).toBeLessThanOrEqual(1);
    });
  });
});

describe('the play-along drums at every number of hits per beat', () => {
  const bar = (time: [number, number], dur: 'whole' | 'half', dots = 0): FixtureScore => ({
    ...PIANO_WALTZ,
    time,
    measures: [{ staves: [[{ pitches: [67], dur, dots }], []] }],
  });
  const heard = (score: FixtureScore, level: Subdivision, drums = true) =>
    buildPerformance(parseScoreText(makeMscx(score, '3.02')))
      .clicks.filter((c) => clickIsHeard(c, level, drums))
      .flatMap((c) =>
        timeHits(hitsForClick(c, level), c.start, c, 1).map(
          ({ hit, at }) => `${at.toFixed(3)} ${hit.voice}`,
        ),
      );
  const rock = bar([4, 4], 'whole');
  const jig = bar([6, 8], 'half', 1);
  const LEVELS = [1, 2, 3, 4] as const;

  it('plays the kick on the and of 3 in rock and the open hat on the last eighth of 6/8, one hit a beat', () => {
    const one = heard(rock, 1);
    expect(one).toContain('1.250 kick');
    expect(one.filter((h) => h.endsWith(' hat'))).toHaveLength(4);
    expect(heard(jig, 1)).toContain('1.250 openHat');
  });

  it('adds only hi-hats as the hits per beat go up: every other hit stays where it was', () => {
    for (const score of [rock, jig, bar([3, 4], 'half', 1), bar([12, 8], 'whole', 1)]) {
      const base = heard(score, 1).filter((h) => !h.endsWith(' hat'));
      for (const level of LEVELS)
        expect(heard(score, level).filter((h) => !h.endsWith(' hat'))).toEqual(base);
    }
  });

  it('plays 1, 2, 3 or 4 hats a beat in four, and 1, 3 or 6 a dotted beat in 6/8 plus its open hat', () => {
    const hats = (score: FixtureScore, level: Subdivision) =>
      heard(score, level).filter((h) => / (hat|openHat)$/.test(h)).length;
    expect(LEVELS.map((l) => hats(rock, l))).toEqual([4, 8, 12, 16]);
    expect(LEVELS.map((l) => hats(jig, l))).toEqual([3, 6, 6, 12]);
    expect(LEVELS.map((l) => hitsPerBeat(l, true))).toEqual([1, 3, 3, 6]);
  });

  it('clicks only on the beat at one a beat, and between them at more', () => {
    const clicks = (level: Subdivision) =>
      buildPerformance(parseScoreText(makeMscx(rock, '3.02'))).clicks.filter((c) =>
        clickIsHeard(c, level, false),
      ).length;
    expect(LEVELS.map(clicks)).toEqual([4, 8, 12, 16]);
  });

  it('on Auto adds hits as you slow down, so the gap between them stays short', () => {
    const quarter = { beatSeconds: 0.5, compound: false };
    expect(autoLevel(quarter, 1)).toBe(1);
    expect(autoLevel(quarter, 0.5)).toBe(2);
    expect(autoLevel(quarter, 0.25)).toBe(4);
    expect(autoLevel(quarter, 0.05)).toBe(4);
    expect(autoLevel({ beatSeconds: 0.75, compound: true }, 1)).toBe(2);
    for (const speed of [1, 0.8, 0.6, 0.4, 0.3]) {
      const level = autoLevel(quarter, speed);
      expect(0.5 / speed / hitsPerBeat(level, false)).toBeLessThanOrEqual(AUTO_GAP_SECONDS);
    }
    expect(levelAt('auto', quarter, 0.5)).toBe(2);
    expect(levelAt(3, quarter, 0.5)).toBe(3);
  });

  it('plays a hit between the beats later at a slower speed, in step with the music', () => {
    const [kick] = timeHits(
      [{ voice: 'kick', level: 1, twelfths: 6 }],
      10,
      { beatSeconds: 0.5 },
      0.5,
    );
    expect(kick?.at).toBeCloseTo(10.5);
  });

  it('turns a ticked Half-beats from before into eighths, and anything else into Auto', () => {
    expect(perBeatOf({ perBeat: null, halfBeats: true })).toBe(2);
    expect(perBeatOf({ perBeat: null, halfBeats: false })).toBe('auto');
    expect(perBeatOf({ perBeat: 4, halfBeats: true })).toBe(4);
  });
});

interface Recorded {
  kind: string;
  type?: string;
  started?: number;
  stopped?: number;
}

function fakeContext() {
  const nodes: Recorded[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
  });
  const connectable = <T extends object>(node: T) =>
    Object.assign(node, { connect: (next: unknown) => next });
  const source = (kind: string, extra: object) => {
    const rec: Recorded = { kind };
    nodes.push(rec);
    return connectable({
      ...extra,
      start: (t: number) => {
        rec.started = t;
      },
      stop: (t: number) => {
        rec.stopped = t;
      },
      set type(value: string) {
        rec.type = value;
      },
    });
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    createOscillator: () => source('osc', { frequency: param() }),
    createBufferSource: () => source('noise', { buffer: null }),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createGain: () => connectable({ gain: param() }),
    createBiquadFilter: () => connectable({ type: '', frequency: param(), Q: param() }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, nodes };
}

describe('drum voices', () => {
  const VOICES: DrumVoice[] = ['kick', 'snare', 'rim', 'hat', 'openHat', 'ride'];

  it('every voice schedules at least one source that starts when asked and stops soon after', () => {
    for (const voice of VOICES) {
      const { ctx, nodes } = fakeContext();
      const played = playDrum(ctx, {} as AudioNode, 2, voice, 0.6);
      expect(played.length, voice).toBeGreaterThan(0);
      expect(nodes.length, voice).toBe(played.length);
      for (const n of nodes) {
        expect(n.started, voice).toBe(2);
        expect(n.stopped ?? 0, voice).toBeGreaterThan(2);
        expect(n.stopped ?? 99, voice).toBeLessThan(2.8);
      }
    }
  });

  it('plays the kick as a sine, and the open hat rings longer than the closed one', () => {
    const kick = fakeContext();
    playDrum(kick.ctx, {} as AudioNode, 0, 'kick', 1);
    expect(kick.nodes.some((n) => n.type === 'sine')).toBe(true);
    const closed = fakeContext();
    const open = fakeContext();
    playDrum(closed.ctx, {} as AudioNode, 0, 'hat', 1);
    playDrum(open.ctx, {} as AudioNode, 0, 'openHat', 1);
    expect(open.nodes[0]?.stopped ?? 0).toBeGreaterThan(closed.nodes[0]?.stopped ?? 99);
  });
});
