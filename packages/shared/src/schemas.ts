import { z } from 'zod';
import { AUDIO_EXTENSIONS, SCORE_EXTENSIONS } from './files.ts';

export const SCHEMA_VERSION = 1;

export const MAX_SCORE_BYTES = 50 * 1024 * 1024;
export const MAX_TRACK_BYTES = 50 * 1024 * 1024;

const isoTimestamp = z.iso.datetime();

export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lower-case letters, digits and single hyphens')
  .max(80)
  .brand<'Slug'>();
export type Slug = z.infer<typeof Slug>;

export const FileName = z
  .string()
  .regex(
    new RegExp(
      `^[a-z0-9]+(?:-[a-z0-9]+)*\\.(${[...SCORE_EXTENSIONS, ...AUDIO_EXTENSIONS].join('|')})$`,
    ),
    'safe file name',
  )
  .max(100)
  .brand<'FileName'>();
export type FileName = z.infer<typeof FileName>;

export const Colour = z.string().regex(/^#[0-9a-f]{6}$/i);

export const ScoreRef = z.object({
  file: FileName,
  name: z.string().min(1).max(200),
});
export type ScoreRef = z.infer<typeof ScoreRef>;

export const TrackRef = z.object({
  file: FileName,
  name: z.string().min(1).max(200),
});
export type TrackRef = z.infer<typeof TrackRef>;

export const Bookmark = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  score: FileName,
  page: z.int().min(1),
  y: z.number().min(0),
});
export type Bookmark = z.infer<typeof Bookmark>;

export const Piece = z.object({
  id: Slug,
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  notes: z.string().max(20_000).default(''),
  targetBpm: z.int().min(20).max(400).nullable().default(null),
  scores: z.array(ScoreRef).default([]),
  tracks: z.array(TrackRef).default([]),
  bookmarks: z.array(Bookmark).default([]),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
export type Piece = z.infer<typeof Piece>;

export const PieceDraft = Piece.pick({
  title: true,
  artist: true,
  tags: true,
  notes: true,
  targetBpm: true,
}).partial({ artist: true, tags: true, notes: true, targetBpm: true });
export type PieceDraft = z.input<typeof PieceDraft>;

export const PiecePatch = z
  .object({
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().max(200),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    notes: z.string().max(20_000),
    targetBpm: z.int().min(20).max(400).nullable(),
    scores: z.array(ScoreRef),
    tracks: z.array(TrackRef),
    bookmarks: z.array(Bookmark),
  })
  .partial()
  .strict();
export type PiecePatch = z.input<typeof PiecePatch>;

const Point = z.tuple([z.number(), z.number(), z.number().min(0).max(1)]);

const ItemBase = z.object({ id: z.string().min(1).max(40), colour: Colour });

export const StrokeItem = ItemBase.extend({
  kind: z.literal('stroke'),
  tool: z.enum(['pen', 'highlighter']),
  size: z.number().positive().max(60),
  points: z.array(Point).min(1).max(5000),
});

export const TextItem = ItemBase.extend({
  kind: z.literal('text'),
  x: z.number(),
  y: z.number(),
  text: z.string().min(1).max(2000),
  size: z.number().positive().max(96),
});

export const ShapeItem = ItemBase.extend({
  kind: z.literal('shape'),
  shape: z.enum(['line', 'arrow', 'rect', 'ellipse']),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  size: z.number().positive().max(30),
});

export const STAMP_GLYPHS = [
  '1',
  '2',
  '3',
  '4',
  'T',
  '↑',
  '↓',
  'P',
  'H',
  'S',
  '𝄆',
  '𝄇',
  '✓',
  '!',
] as const;
export const StampItem = ItemBase.extend({
  kind: z.literal('stamp'),
  glyph: z.enum(STAMP_GLYPHS),
  x: z.number(),
  y: z.number(),
  size: z.number().positive().max(96),
});

export const AnnotationItem = z.discriminatedUnion('kind', [
  StrokeItem,
  TextItem,
  ShapeItem,
  StampItem,
]);
export type AnnotationItem = z.infer<typeof AnnotationItem>;
export type StrokeItem = z.infer<typeof StrokeItem>;
export type TextItem = z.infer<typeof TextItem>;
export type ShapeItem = z.infer<typeof ShapeItem>;
export type StampItem = z.infer<typeof StampItem>;

export const Annotations = z.object({
  version: z.literal(1),
  pages: z.record(z.string().regex(/^[1-9][0-9]*$/), z.array(AnnotationItem)),
});
export type Annotations = z.infer<typeof Annotations>;
export const emptyAnnotations = (): Annotations => ({ version: 1, pages: {} });

export const Loop = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  rate: z.number().min(0.25).max(2),
});
export type Loop = z.infer<typeof Loop>;

export const Loops = z.object({
  tracks: z.record(z.string(), z.array(Loop)),
});
export type Loops = z.infer<typeof Loops>;

export const Setlist = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  pieceIds: z.array(Slug),
});
export type Setlist = z.infer<typeof Setlist>;

export const Setlists = z.object({ setlists: z.array(Setlist) });
export type Setlists = z.infer<typeof Setlists>;

export const PracticeSession = z.object({
  id: z.string().min(1).max(40),
  pieceId: Slug,
  startedAt: isoTimestamp,
  durationSec: z
    .int()
    .min(1)
    .max(24 * 3600),
  bpm: z.int().min(20).max(400).nullable(),
  note: z.string().max(2000),
});
export type PracticeSession = z.infer<typeof PracticeSession>;

export const NewPracticeSession = PracticeSession.omit({ id: true });
export type NewPracticeSession = z.infer<typeof NewPracticeSession>;
