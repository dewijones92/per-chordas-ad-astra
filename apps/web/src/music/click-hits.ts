import type { PerBeat, Subdivision } from '@pcaa/shared';
import { drumHits, TWELFTHS_PER_BEAT, type DrumHit, type DrumSlot } from '../drums/grooves.ts';
import type { PerfClick } from './performance.ts';

export const AUTO_GAP_SECONDS = 0.6;
const AUTO_LEVELS: readonly Subdivision[] = [1, 2, 4];
const EIGHTH = 4;

type GridClick = Pick<PerfClick, 'at' | 'beat' | 'compound' | 'groove' | 'kind' | 'beatSeconds'>;

export function hitsPerBeat(level: Subdivision, compound: boolean): number {
  if (!compound) return level;
  return level === 1 ? 1 : level === 4 ? 6 : 3;
}

function stepOf(level: Subdivision, compound: boolean): number {
  return TWELFTHS_PER_BEAT / hitsPerBeat(level, compound);
}

export function autoLevel(
  click: Pick<PerfClick, 'beatSeconds' | 'compound'>,
  speed: number,
): Subdivision {
  const beat = click.beatSeconds / Math.max(0.01, speed);
  for (const level of AUTO_LEVELS)
    if (beat / hitsPerBeat(level, click.compound) <= AUTO_GAP_SECONDS) return level;
  return 4;
}

export function levelAt(
  perBeat: PerBeat,
  click: Pick<PerfClick, 'beatSeconds' | 'compound'>,
  speed: number,
): Subdivision {
  return perBeat === 'auto' ? autoLevel(click, speed) : perBeat;
}

function onGrid(click: GridClick, level: Subdivision): boolean {
  return click.at % stepOf(level, click.compound) === 0;
}

function onGrooveGrid(click: GridClick): boolean {
  return click.groove === 'sixeight' ? click.at % EIGHTH === 0 : click.at === 0;
}

export function clickIsHeard(click: GridClick, level: Subdivision, drums: boolean): boolean {
  return onGrid(click, level) || (drums && onGrooveGrid(click));
}

function slotOf(click: GridClick, level: Subdivision): DrumSlot {
  if (click.groove === 'sixeight') {
    const beat = click.beat * 3 + Math.floor(click.at / EIGHTH);
    return level === 4
      ? { beat, sub: (click.at % EIGHTH) / 2, subdivision: 2 }
      : { beat, sub: 0, subdivision: 1 };
  }
  if (!onGrid(click, level)) return { beat: click.beat, sub: 0, subdivision: 1 };
  const step = stepOf(level, click.compound);
  return { beat: click.beat, sub: click.at / step, subdivision: TWELFTHS_PER_BEAT / step };
}

export function hitsForClick(click: GridClick, level: Subdivision): DrumHit[] {
  return drumHits(click.groove, slotOf(click, level), click.kind === 'bar', onGrid(click, level));
}

export interface TimedHit {
  hit: DrumHit;
  at: number;
}

export function timeHits(
  hits: readonly DrumHit[],
  when: number,
  click: Pick<PerfClick, 'beatSeconds'>,
  speed: number,
): TimedHit[] {
  const twelfth = click.beatSeconds / TWELFTHS_PER_BEAT / Math.max(0.01, speed);
  return hits.map((hit) => ({ hit, at: when + hit.twelfths * twelfth }));
}
