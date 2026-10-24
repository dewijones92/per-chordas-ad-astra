import type { Jump, ScoreMeasure, Volta } from './model.ts';

export interface UnrollResult {
  order: number[];
  warnings: string[];
}

const MAX_PLAYED = 20_000;

interface Section {
  start: number;
  end: number;
}

export function sectionsOf(measures: readonly ScoreMeasure[]): Section[] {
  const sections: Section[] = [];
  let start = 0;
  measures.forEach((m, i) => {
    if (m.sectionEnd || i === measures.length - 1) {
      sections.push({ start, end: i + 1 });
      start = i + 1;
    }
  });
  return sections;
}

function unrollSection(
  measures: readonly ScoreMeasure[],
  section: Section,
  voltas: readonly Volta[],
  order: number[],
  warnings: string[],
): void {
  const inSection = voltas.filter((v) => v.start >= section.start && v.start < section.end);
  const covering = (index: number) => inSection.filter((v) => v.start <= index && index < v.end);
  const groupOf = (volta: Volta): Volta[] => {
    const sorted = [...inSection].sort((a, b) => a.start - b.start);
    let first = sorted.indexOf(volta);
    const touches = (a: Volta | undefined, b: Volta | undefined) =>
      a !== undefined && b !== undefined && b.start <= a.end;
    while (first > 0 && touches(sorted[first - 1], sorted[first])) first -= 1;
    const group: Volta[] = [];
    let reach = -1;
    for (let k = first; k < sorted.length; k++) {
      const v = sorted[k];
      if (!v) break;
      if (group.length > 0 && v.start > reach) break;
      group.push(v);
      reach = Math.max(reach, v.end);
    }
    return group;
  };

  const findLabel = (label: string, from: number, backwardsFirst: boolean): number | null => {
    if (label === 'start') return section.start;
    const has = (j: number) => measures[j]?.markers.includes(label) === true;
    const back = () => {
      for (let j = from; j >= section.start; j--) if (has(j)) return j;
      return null;
    };
    const forward = () => {
      for (let j = from; j < section.end; j++) if (has(j)) return j;
      return null;
    };
    const found = backwardsFirst ? (back() ?? forward()) : (forward() ?? back());
    if (found !== null) return found;
    const anywhere = measures.find((m) => m.markers.includes(label));
    return anywhere ? anywhere.index : null;
  };

  const repeatStartFor = (index: number): number => {
    for (let j = index; j >= section.start; j--) {
      if (measures[j]?.startRepeat) return j;
    }
    return section.start;
  };

  const closingEnd = (index: number): number | null => {
    const start = repeatStartFor(index);
    for (let e = index; e < section.end; e++) {
      const m = measures[e];
      if (!m) break;
      if (e > index && m.startRepeat) return null;
      if (m.endRepeat > 0 && repeatStartFor(e) === start) return e;
    }
    return null;
  };

  const passOf = new Map<number, number>();
  const loopsAt = new Map<number, number>();
  const jumpsTaken = new Set<number>();
  const passAt = (index: number) => passOf.get(repeatStartFor(index)) ?? 1;
  const voltaPass = (volta: Volta) => passAt(groupOf(volta)[0]?.start ?? volta.start);

  const onFinalPass = (index: number): boolean => {
    const pass = passAt(index);
    const end = closingEnd(index);
    let limit = end === null ? 1 : (measures[end]?.endRepeat ?? 1);
    for (const v of covering(index)) limit = Math.min(limit, Math.max(...v.endings));
    return pass >= limit;
  };

  const settleBefore = (origin: number) => {
    for (let e = section.start; e <= origin; e++) {
      const m = measures[e];
      if (!m || m.endRepeat === 0) continue;
      const start = repeatStartFor(e);
      passOf.set(start, Math.max(passOf.get(start) ?? 1, m.endRepeat));
      loopsAt.set(e, m.endRepeat - 1);
    }
  };

  let active: Jump | null = null;
  let i = section.start;

  while (i < section.end) {
    if (order.length > MAX_PLAYED) {
      warnings.push('The repeats never end; stopped after 20,000 bars');
      return;
    }
    const measure = measures[i];
    if (!measure) return;
    const blocking = covering(i).find((v) => !v.endings.includes(voltaPass(v)));
    if (blocking) {
      const group = groupOf(blocking);
      const pass = voltaPass(blocking);
      const matches = (v: Volta) => v.endings.includes(voltaPass(v));
      const anyEnding = group.some((v) => v.endings.includes(pass)) || covering(i).some(matches);
      const groupEnd = Math.max(...group.map((v) => v.end));
      const close = closingEnd(group.at(-1)?.start ?? blocking.start);
      const closeCount = close === null ? 0 : (measures[close]?.endRepeat ?? 0);
      const skipTo =
        anyEnding || close === null
          ? blocking.end
          : close === groupEnd && pass <= closeCount
            ? close
            : close + 1;
      i = Math.max(i + 1, skipTo);
      continue;
    }
    order.push(i);

    if (
      active &&
      active.playUntil !== 'end' &&
      measure.markers.includes(active.playUntil) &&
      onFinalPass(i)
    ) {
      const target = active.continueAt ? findLabel(active.continueAt, i, false) : null;
      if (target === null) return;
      active = null;
      i = target;
      continue;
    }

    if (measure.jump && !jumpsTaken.has(i) && onFinalPass(i)) {
      const jump = measure.jump;
      const target = findLabel(jump.jumpTo, i, true);
      jumpsTaken.add(i);
      if (target === null || target === i) {
        warnings.push(`Bar ${String(measure.number)}: no "${jump.jumpTo}" to jump to; carried on`);
      } else {
        active = jump;
        if (jump.playRepeats) {
          passOf.clear();
          loopsAt.clear();
        } else {
          settleBefore(i);
        }
        const landing = covering(target)[0];
        if (landing) {
          passOf.set(repeatStartFor(landing.start), Math.min(...landing.endings));
          for (let e = target; e < landing.end; e++) loopsAt.delete(e);
        }
        i = target;
        continue;
      }
    }

    if (measure.endRepeat > 0) {
      const loops = loopsAt.get(i) ?? 0;
      if (loops < measure.endRepeat - 1) {
        loopsAt.set(i, loops + 1);
        const target = repeatStartFor(i);
        passOf.set(target, (passOf.get(target) ?? 1) + 1);
        i = target;
        continue;
      }
    }

    i += 1;
  }
}

export function unroll(measures: readonly ScoreMeasure[], voltas: readonly Volta[]): UnrollResult {
  const warnings: string[] = [];
  const order: number[] = [];
  for (const section of sectionsOf(measures)) {
    unrollSection(measures, section, voltas, order, warnings);
  }
  return { order, warnings };
}
