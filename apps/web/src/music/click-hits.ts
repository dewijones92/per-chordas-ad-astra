import { drumHits, type DrumHit } from '../drums/grooves.ts';
import type { PerfClick } from './performance.ts';

export function clickIsHeard(kind: PerfClick['kind'], halfBeats: boolean, drums: boolean): boolean {
  return halfBeats || drums || kind !== 'sub';
}

export function hitsForClick(click: PerfClick, halfBeats: boolean): DrumHit[] {
  return drumHits(
    click.groove,
    click.slot,
    click.kind === 'bar',
    halfBeats || click.kind !== 'sub',
  );
}
