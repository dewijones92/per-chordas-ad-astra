import { z } from 'zod';

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const Subdivision = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Subdivision = z.infer<typeof Subdivision>;

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

export const PLAY_ALONG_MIN_SPEED = 0.25;
export const PLAY_ALONG_MAX_SPEED = 2;

export const PlayAlongPrefs = z.object({
  speed: z.number().min(PLAY_ALONG_MIN_SPEED).max(PLAY_ALONG_MAX_SPEED),
  loop: z.object({ from: z.int().min(0), to: z.int().min(0) }).nullable(),
  hidden: z.array(z.int().min(0)).max(64),
  muted: z.array(z.int().min(0)).max(64),
  full: z.boolean(),
  position: z.number().min(0),
  ramp: z.boolean().default(false),
  names: z.boolean().default(false),
});
export type PlayAlongPrefs = z.output<typeof PlayAlongPrefs>;
export const RAMP_STEP = 0.05;
export const RAMP_TARGET = 1;
export const DEFAULT_PLAY_ALONG: PlayAlongPrefs = {
  speed: 1,
  loop: null,
  hidden: [],
  muted: [],
  full: false,
  position: 0,
  ramp: false,
  names: false,
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
