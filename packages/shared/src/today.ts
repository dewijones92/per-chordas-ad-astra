import { z } from 'zod';
import { FileName, Slug } from './schemas.ts';

export const TodayBit = z.object({
  file: FileName,
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  fromBar: z.int().min(0),
  toBar: z.int().min(0),
  bestSpeed: z.number().min(0),
});
export type TodayBit = z.infer<typeof TodayBit>;

export const TodayPiece = z.object({
  id: Slug,
  title: z.string().min(1).max(200),
  pinned: z.boolean(),
  targetBpm: z.int().min(20).max(400).nullable(),
  lastPractisedAt: z.int().min(0).nullable(),
  bestBpm: z.int().min(20).max(400).nullable(),
  bits: z.array(TodayBit),
});
export type TodayPiece = z.infer<typeof TodayPiece>;

export const TodayFacts = z.object({ pieces: z.array(TodayPiece) });
export type TodayFacts = z.infer<typeof TodayFacts>;

export const bitKey = (pieceId: string, file: string, bitId: string): string =>
  `${pieceId}/${file}/${bitId}`;
export const pieceKey = (pieceId: string): string => `piece/${pieceId}`;
