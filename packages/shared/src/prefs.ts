import { z } from 'zod';

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const Subdivision = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Subdivision = z.infer<typeof Subdivision>;
export const PerBeat = z.union([z.literal('auto'), Subdivision]);
export type PerBeat = z.infer<typeof PerBeat>;
export const COUNT_IN_MAX_BEATS = 16;
export const LoopRange = z.object({
  from: z.int().min(0),
  to: z.int().min(0),
  fromBeat: z.int().min(0).max(63).optional(),
  toBeat: z.int().min(1).max(64).optional(),
});
export type LoopRange = z.infer<typeof LoopRange>;
export const CountIn = z.union([z.literal('bar'), z.int().min(0).max(COUNT_IN_MAX_BEATS)]);
export type CountIn = z.infer<typeof CountIn>;

export const METRONOME_SOUNDS = ['click', 'drums'] as const;
export const MetronomeSound = z.enum(METRONOME_SOUNDS);
export type MetronomeSound = z.infer<typeof MetronomeSound>;

export const GROOVES = ['rock', 'ballad', 'waltz', 'sixeight', 'swing', 'bossa'] as const;
export const Groove = z.enum(GROOVES);
export type Groove = z.infer<typeof Groove>;

export const SpeedTrainer = z.object({
  enabled: z.boolean(),
  stepBpm: z.number().min(1).max(1000),
  everyBars: z.number().min(1).max(1000),
  maxBpm: z.number().min(1).max(1000),
});
export type SpeedTrainer = z.infer<typeof SpeedTrainer>;

export const MetronomeSettings = z.object({
  bpm: z.number().min(MIN_BPM).max(MAX_BPM),
  beatsPerBar: z.int().min(1).max(32),
  subdivision: Subdivision,
  accentFirstBeat: z.boolean(),
  trainer: SpeedTrainer,
  sound: MetronomeSound.default('click'),
  groove: Groove.default('rock'),
});
export type MetronomeSettings = z.infer<typeof MetronomeSettings>;

export const SettingsFile = z.object({
  metronome: MetronomeSettings,
  updatedAt: z.iso.datetime(),
});
export type SettingsFile = z.infer<typeof SettingsFile>;

export const MetronomeSave = z.object({
  settings: MetronomeSettings,
  at: z.int().nonnegative(),
});
export type MetronomeSave = z.infer<typeof MetronomeSave>;

export const PIECE_VIEWS = ['score', 'split', 'notes'] as const;
export const PieceView = z.enum(PIECE_VIEWS);
export type PieceView = z.infer<typeof PieceView>;

export const INSTRUMENTS = ['piano', 'guitar'] as const;
export const Instrument = z.enum(INSTRUMENTS);
export type Instrument = z.infer<typeof Instrument>;

export const PLAY_ALONG_MIN_SPEED = 0.05;
export const PLAY_ALONG_MAX_SPEED = 2;
export const PLAY_ALONG_SPEED_STEP = 0.005;
export const RAMP_STEP = 0.05;
export const RAMP_TARGET = 1;
export const RAMP_MIN_STEP = 0.005;
export const RAMP_MAX_STEP = 0.2;

export const MIN_LOOK_AHEAD = 1;
export const MAX_LOOK_AHEAD = 20;
export const DEFAULT_LOOK_AHEAD = 3;
export const LOOK_AHEAD_STEPS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20] as const;

export function clampLookAhead(seconds: number): number {
  return Math.min(MAX_LOOK_AHEAD, Math.max(MIN_LOOK_AHEAD, seconds));
}

export function stepLookAhead(seconds: number, direction: 1 | -1): number {
  const steps: readonly number[] = LOOK_AHEAD_STEPS;
  const next =
    direction > 0
      ? steps.find((s) => s > seconds + 1e-9)
      : [...steps].reverse().find((s) => s < seconds - 1e-9);
  return clampLookAhead(next ?? seconds);
}

export function roundSpeed(speed: number): number {
  return Math.round(speed / PLAY_ALONG_SPEED_STEP) / (1 / PLAY_ALONG_SPEED_STEP);
}

export function stepSpeed(speed: number, direction: 1 | -1): number {
  const place = speed / PLAY_ALONG_SPEED_STEP;
  const next = direction > 0 ? Math.floor(place + 1e-6) + 1 : Math.ceil(place - 1e-6) - 1;
  return roundSpeed(next * PLAY_ALONG_SPEED_STEP);
}

export function speedPercent(speed: number): number {
  return Math.round(speed * 1000) / 10;
}

export const PlayAlongPrefs = z.object({
  speed: z.number().min(PLAY_ALONG_MIN_SPEED).max(PLAY_ALONG_MAX_SPEED),
  loop: LoopRange.nullable(),
  loopOn: z.boolean().default(true),
  hidden: z.array(z.int().min(0)).max(64),
  muted: z.array(z.int().min(0)).max(64),
  full: z.boolean(),
  position: z.number().min(0),
  ramp: z.boolean().default(false),
  rampStep: z.number().min(RAMP_MIN_STEP).max(RAMP_MAX_STEP).default(RAMP_STEP),
  rampTarget: z.number().min(PLAY_ALONG_MIN_SPEED).max(PLAY_ALONG_MAX_SPEED).default(RAMP_TARGET),
  names: z.boolean().default(false),
  notation: z.boolean().default(true),
  countIn: z.boolean().default(true),
  countInBeats: CountIn.nullable().default(null),
  click: z.boolean().default(false),
  halfBeats: z.boolean().default(false),
  perBeat: PerBeat.nullable().default(null),
  drums: z.boolean().default(false),
  playOn: Instrument.nullable().default(null),
  byHand: z.boolean().nullable().default(null),
  handHidden: z.array(z.int().min(0).max(1)).max(2).default([]),
  handMuted: z.array(z.int().min(0).max(1)).max(2).default([]),
  tails: z.boolean().default(false),
  thinOctaves: z.boolean().default(true),
  lookAhead: z.number().min(MIN_LOOK_AHEAD).max(MAX_LOOK_AHEAD).default(DEFAULT_LOOK_AHEAD),
  notationHeight: z.int().min(40).max(4000).nullable().default(null),
  compact: z.boolean().default(false),
  suggest: z.boolean().default(true),
  chords: z.boolean().default(false),
  waitForMe: z.boolean().default(false),
  hands: z.boolean().default(true),
});
export type PlayAlongPrefs = z.output<typeof PlayAlongPrefs>;
export const DEFAULT_PLAY_ALONG: PlayAlongPrefs = {
  speed: 1,
  loop: null,
  loopOn: true,
  hidden: [],
  muted: [],
  full: false,
  position: 0,
  ramp: false,
  rampStep: RAMP_STEP,
  rampTarget: RAMP_TARGET,
  names: false,
  notation: true,
  countIn: true,
  countInBeats: null,
  click: false,
  halfBeats: false,
  perBeat: null,
  drums: false,
  playOn: null,
  byHand: null,
  handHidden: [],
  handMuted: [],
  tails: false,
  thinOctaves: true,
  lookAhead: DEFAULT_LOOK_AHEAD,
  notationHeight: null,
  compact: false,
  suggest: true,
  chords: false,
  waitForMe: false,
  hands: true,
};

export const VIEW_MODES = ['page', 'spread', 'width'] as const;
export const ViewMode = z.enum(VIEW_MODES);
export type ViewMode = z.infer<typeof ViewMode>;

export const LIBRARY_SORTS = [
  'title',
  'artist',
  'added',
  'edited',
  'opened',
  'practised',
  'neglected',
  'most-practised',
  'tempo',
] as const;
export const LibrarySort = z.enum(LIBRARY_SORTS);
export type LibrarySort = z.infer<typeof LibrarySort>;

export const SortChoice = z.object({ sort: LibrarySort, reversed: z.boolean() });
export type SortChoice = z.infer<typeof SortChoice>;
export const DEFAULT_SORT: SortChoice = { sort: 'title', reversed: false };

export function countInOf(prefs: Pick<PlayAlongPrefs, 'countIn' | 'countInBeats'>): CountIn {
  return prefs.countIn ? (prefs.countInBeats ?? 'bar') : 0;
}

export function perBeatOf(prefs: Pick<PlayAlongPrefs, 'perBeat' | 'halfBeats'>): PerBeat {
  return prefs.perBeat ?? (prefs.halfBeats ? 2 : 'auto');
}
