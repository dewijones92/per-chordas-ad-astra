import { beatTicks } from '../metronome/click.ts';
import {
  firstPerTick,
  GRACE_TICKS,
  roleFor,
  staffName,
  TPQ,
  uniqueStaffNames,
  velocityForDynamic,
  beamMode,
  markTupletEnds,
  type ClefMark,
  type DynamicMark,
  type NotationEvent,
  type TimeMark,
  type Jump,
  type KeyMark,
  type ScoreMeasure,
  type ScoreModel,
  type ScoreNote,
  type ScorePart,
  type ScoreStaff,
  type TempoMark,
  type Volta,
} from './model.ts';
import {
  child,
  childElements,
  childNumber,
  childrenNamed,
  childText,
  parseFraction,
  text,
} from './xml.ts';

const QUARTERS: Readonly<Record<string, number>> = {
  longa: 16,
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 1 / 16,
  '128th': 1 / 32,
  '256th': 1 / 64,
  '512th': 1 / 128,
  '1024th': 1 / 256,
};

const GRACE_BEFORE = new Set(['acciaccatura', 'appoggiatura', 'grace4', 'grace16', 'grace32']);
const GRACE_AFTER = new Set(['grace8after', 'grace16after', 'grace32after']);

interface StaffDef {
  id: number;
  part: number;
  skip: boolean;
  clef: string;
}

interface PendingRepeat {
  staff: number;
  measure: number;
  count: number;
}

interface Walk {
  staff: number;
  part: number;
  measure: ScoreMeasure;
  scale: number;
  voice: number;
}

function wholeToTicks(fraction: number): number {
  return fraction * 4 * TPQ;
}

function chordTicks(el: Element, measureTicks: number, scale: number): number {
  const type = childText(el, 'durationType');
  if (type === 'measure') {
    const given = parseFraction(childText(el, 'duration'));
    return given === null ? measureTicks : wholeToTicks(given) * scale;
  }
  const quarters = QUARTERS[type];
  if (quarters === undefined) {
    const given = parseFraction(childText(el, 'duration'));
    return given === null ? 0 : wholeToTicks(given) * scale;
  }
  let ticks = quarters * TPQ;
  let add = ticks;
  const dots = childNumber(el, 'dots') ?? 0;
  for (let d = 0; d < dots; d++) {
    add /= 2;
    ticks += add;
  }
  return ticks * scale;
}

function graceKind(el: Element): 'before' | 'after' | null {
  for (const c of childElements(el)) {
    if (GRACE_BEFORE.has(c.tagName)) return 'before';
    if (GRACE_AFTER.has(c.tagName)) return 'after';
  }
  return null;
}

function noteTiesForward(note: Element): boolean {
  if (child(note, 'Tie')) return true;
  return childrenNamed(note, 'Spanner').some(
    (s) => s.getAttribute('type') === 'Tie' && child(s, 'next') !== null,
  );
}

function notePlays(note: Element): boolean {
  const play = childText(note, 'play');
  return play !== '0' && play !== 'false';
}

function locationTicks(el: Element): number {
  const loc = child(el, 'location') ?? el;
  const fractions = parseFraction(childText(loc, 'fractions'));
  return fractions === null ? 0 : wholeToTicks(fractions);
}

function spanLength(el: Element): { measures: number; fractions: number } {
  const loc = child(child(el, 'next') ?? el, 'location');
  if (!loc) return { measures: 0, fractions: 0 };
  return {
    measures: childNumber(loc, 'measures') ?? 0,
    fractions: parseFraction(childText(loc, 'fractions')) ?? 0,
  };
}

function parseEndings(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .flatMap((part) => {
      const range = /^(\d+)-(\d+)$/.exec(part);
      if (range) {
        const out: number[] = [];
        for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(n);
        return out;
      }
      const n = Number(part);
      return Number.isInteger(n) && n > 0 ? [n] : [];
    })
    .filter((n, i, all) => all.indexOf(n) === i);
}

function readJump(el: Element): Jump {
  return {
    jumpTo: childText(el, 'jumpTo') || 'start',
    playUntil: childText(el, 'playUntil') || 'end',
    continueAt: childText(el, 'continueAt'),
    playRepeats: childText(el, 'playRepeats') === '1' || childText(el, 'playRepeats') === 'true',
  };
}

function markerLabel(el: Element): string {
  const label = childText(el, 'label');
  if (label) return label;
  return childText(el, 'subtype').toLowerCase();
}

function creditOf(
  score: Element,
  metaNames: readonly string[],
  styles: readonly string[],
  firstLineOnly: boolean,
): string {
  for (const tag of childrenNamed(score, 'metaTag')) {
    const name = tag.getAttribute('name');
    if (name !== null && metaNames.includes(name) && text(tag)) return text(tag);
  }
  for (const staff of childrenNamed(score, 'Staff')) {
    for (const box of childrenNamed(staff, 'VBox')) {
      for (const t of childrenNamed(box, 'Text')) {
        const style = childText(t, 'style').toLowerCase();
        if (styles.includes(style)) {
          const value = (child(t, 'text')?.textContent ?? '')
            .split('\n')
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter((line) => line !== '')
            .slice(0, firstLineOnly ? 1 : undefined)
            .join(' ');
          if (value) return value;
        }
      }
    }
  }
  return '';
}

function stretchOf(timeSig: Element): number {
  const n = childNumber(timeSig, 'stretchN');
  const d = childNumber(timeSig, 'stretchD');
  return n && d ? d / n : 1;
}

function sectionBreakIn(el: Element): boolean {
  return childrenNamed(el, 'LayoutBreak').some((b) => {
    const subtype = childText(b, 'subtype');
    return subtype === 'section';
  });
}

function keyFifths(el: Element): number | null {
  return childNumber(el, 'concertKey') ?? childNumber(el, 'accidental') ?? childNumber(el, 'key');
}

function readStaffDefs(score: Element): { parts: ScorePart[]; defs: StaffDef[]; names: string[] } {
  const parts: ScorePart[] = [];
  const defs: StaffDef[] = [];
  const names: string[] = [];
  childrenNamed(score, 'Part').forEach((part, partIndex) => {
    const instrument = child(part, 'Instrument');
    const name =
      childText(part, 'trackName') ||
      (instrument ? childText(instrument, 'longName') || childText(instrument, 'trackName') : '') ||
      `Part ${String(partIndex + 1)}`;
    names.push(name);
    parts.push({ name, staves: [] });
    const instrumentClefs = instrument ? childrenNamed(instrument, 'clef') : [];
    childrenNamed(part, 'Staff').forEach((staff, position) => {
      const id = Number(staff.getAttribute('id'));
      const group = child(staff, 'StaffType')?.getAttribute('group') ?? 'pitched';
      const linked = child(staff, 'linkedTo') !== null;
      const fromInstrument = instrumentClefs.find(
        (c) => Number(c.getAttribute('staff') ?? '1') === position + 1,
      );
      const clef = childText(staff, 'defaultClef') || text(fromInstrument ?? null) || 'G';
      defs.push({ id, part: partIndex, skip: group === 'percussion' || linked, clef });
    });
  });
  return { parts, defs, names };
}

export function parseMscx(doc: Document): ScoreModel {
  const root = doc.documentElement;
  if (root.tagName !== 'museScore') throw new Error('Not a MuseScore file');
  const version = root.getAttribute('version') ?? '';
  const score = child(root, 'Score');
  if (!score) throw new Error('This MuseScore file has no score in it');
  const division = childNumber(score, 'Division') ?? TPQ;
  const tickScale = TPQ / division;
  const warnings: string[] = [];

  const { parts, defs } = readStaffDefs(score);
  const contentStaves = childrenNamed(score, 'Staff');
  if (contentStaves.length === 0) throw new Error('This MuseScore file has no staves');

  const defById = new Map(defs.map((d) => [d.id, d]));
  const staves: ScoreStaff[] = [];
  const staffIndexById = new Map<number, number>();
  for (const el of contentStaves) {
    const id = Number(el.getAttribute('id'));
    const def = defById.get(id) ?? { id, part: 0, skip: false, clef: 'G' };
    if (def.skip) continue;
    staffIndexById.set(id, staves.length);
    staves.push({ index: staves.length, part: def.part, name: '', role: 'single' });
    parts[def.part]?.staves.push(staves.length - 1);
  }
  if (parts.length === 0) parts.push({ name: 'Music', staves: staves.map((s) => s.index) });
  for (const part of parts) {
    part.staves.forEach((s, i) => {
      const staff = staves[s];
      if (!staff) return;
      staff.role = roleFor(part.staves.length, i);
      staff.name = staffName(part.name, part.staves.length, i);
    });
  }

  uniqueStaffNames(staves);

  const first = contentStaves[0];
  if (!first) throw new Error('This MuseScore file has no staves');
  const measures: ScoreMeasure[] = [];
  let sig = 1;
  let beat = TPQ;
  let tick = 0;
  let number = 0;
  let restartNumbers = false;
  const times: TimeMark[] = [];
  for (const el of childElements(first)) {
    if (el.tagName !== 'Measure') {
      if (sectionBreakIn(el)) {
        const previous = measures.at(-1);
        if (previous) previous.sectionEnd = true;
        restartNumbers = true;
      }
      continue;
    }
    const timeSig = el.getElementsByTagName('TimeSig')[0];
    if (timeSig) {
      const n = childNumber(timeSig, 'sigN');
      const d = childNumber(timeSig, 'sigD');
      if (n && d) {
        const stretch = stretchOf(timeSig);
        sig = (n / d) * stretch;
        beat = stretch === 1 ? beatTicks(n, d, TPQ) : TPQ;
        if (stretch === 1) times.push({ tick, n, d });
      }
    }
    const len = parseFraction(el.getAttribute('len') ?? '');
    const ticks = wholeToTicks(len ?? sig);
    const irregular = child(el, 'irregular') !== null && childText(el, 'irregular') !== '0';
    if (restartNumbers) number = 0;
    restartNumbers = false;
    if (!irregular) number += 1;
    number += childNumber(el, 'noOffset') ?? 0;
    const sectionEnd = sectionBreakIn(el);
    if (sectionEnd) restartNumbers = true;
    measures.push({
      index: measures.length,
      number: Math.max(1, number),
      tick,
      ticks,
      startRepeat: false,
      endRepeat: 0,
      markers: [],
      jump: null,
      sectionEnd,
      beat,
    });
    tick += ticks;
  }

  const notes: ScoreNote[] = [];
  const tempos: TempoMark[] = [];
  const dynamics: DynamicMark[] = [];
  const keys: KeyMark[] = [];
  const voltas: Volta[] = [];
  const repeats: PendingRepeat[] = [];
  const openVoltas = new Map<string, { start: number; endings: number[] }>();
  const events: NotationEvent[] = [];
  const clefs: ClefMark[] = [];
  let tupletSerial = 0;

  contentStaves.forEach((staffEl, staffOrder) => {
    const id = Number(staffEl.getAttribute('id'));
    const staff = staffIndexById.get(id);
    const def = defById.get(id);
    const part = def?.part ?? 0;
    const staffMeasures = childrenNamed(staffEl, 'Measure');
    let staffStretch = 1;
    if (staffMeasures.length !== measures.length) {
      warnings.push(
        `Staff ${String(id)} has ${String(staffMeasures.length)} bars, the first has ${String(measures.length)}`,
      );
    }
    staffMeasures.forEach((mEl, mIndex) => {
      const measure = measures[mIndex];
      if (!measure) return;
      if (child(mEl, 'startRepeat')) measure.startRepeat = true;
      const end = child(mEl, 'endRepeat');
      if (end) measure.endRepeat = Math.max(measure.endRepeat, Number(text(end)) || 2);

      const walk = (container: Element, voice: number) => {
        const w: Walk = { staff: staff ?? -1, part, measure, scale: 1, voice };
        const tuplets: { ratio: number; normal: number; actual: number; key: string }[] = [];
        const tupletDefs = new Map<
          string,
          { scale: number; parent: string; normal: number; actual: number }
        >();
        let cursor = 0;
        let pendingGrace: Element[] = [];
        let lastChord: { tick: number; ticks: number } | null = null;
        let slurStart = false;
        let slurStop = false;

        const event = (
          el: Element,
          at: number,
          ticks: number,
          grace: 'before' | 'after' | null,
          rest: boolean,
        ) => {
          if (w.staff < 0) return;
          const ref = childText(el, 'Tuplet');
          const def = ref ? tupletDefs.get(ref) : undefined;
          const top = tuplets.at(-1);
          const tuplet = def
            ? { normal: def.normal, actual: def.actual, start: false, stop: false }
            : top
              ? { normal: top.normal, actual: top.actual, start: false, stop: false }
              : null;
          const tupletKey = def
            ? `${String(w.staff)}:${String(measure.index)}:${String(w.voice)}:${ref}`
            : (top?.key ?? null);
          const slurs = childrenNamed(el, 'Slur');
          const chordSlurs = childrenNamed(el, 'Spanner').filter(
            (x) => x.getAttribute('type') === 'Slur',
          );
          const type = childText(el, 'durationType');
          const track = childNumber(el, 'track');
          events.push({
            staff: w.staff,
            voice: track === null ? w.voice : track % 4,
            measure: measure.index,
            tick: measure.tick + at,
            ticks,
            type: type === 'measure' ? '' : type,
            dots: childNumber(el, 'dots') ?? 0,
            rest,
            measureRest: rest && type === 'measure',
            grace,
            tuplet: grace ? null : tuplet,
            tupletKey: grace ? null : tupletKey,
            beam: beamMode(childText(el, 'BeamMode')),
            slurStart:
              !rest &&
              (slurStart ||
                slurs.some((x) => x.getAttribute('type') === 'start') ||
                chordSlurs.some((x) => child(x, 'next') !== null)),
            slurStop:
              !rest &&
              (slurStop ||
                slurs.some((x) => x.getAttribute('type') === 'stop') ||
                chordSlurs.some((x) => child(x, 'prev') !== null)),
            notes: rest
              ? []
              : childrenNamed(el, 'Note').flatMap((note) => {
                  const pitch = childNumber(note, 'pitch');
                  return pitch === null
                    ? []
                    : [
                        {
                          pitch,
                          tpc: childNumber(note, 'tpc'),
                          tieForward: noteTiesForward(note),
                          silent: !notePlays(note),
                        },
                      ];
                }),
          });
          if (!rest && !grace) {
            slurStart = false;
            slurStop = false;
          }
        };

        const tupletScale = (id: string): number => {
          let scale = 1;
          let current: string = id;
          for (let guard = 0; current && guard < 8; guard++) {
            const def = tupletDefs.get(current);
            if (!def) break;
            scale *= def.scale;
            current = def.parent;
          }
          return scale;
        };

        const emit = (chordEl: Element, at: number, ticks: number, grace: boolean) => {
          if (w.staff < 0) return;
          for (const note of childrenNamed(chordEl, 'Note')) {
            const pitch = childNumber(note, 'pitch');
            if (pitch === null || !notePlays(note)) continue;
            notes.push({
              staff: w.staff,
              measure: measure.index,
              pitch,
              tick: measure.tick + at,
              ticks,
              tieForward: noteTiesForward(note),
              grace,
            });
          }
        };

        for (const el of childElements(container)) {
          if (el.tagName === 'TimeSig') staffStretch = stretchOf(el);
          const scale = tuplets.reduce((a, b) => a * b.ratio, staffStretch);
          switch (el.tagName) {
            case 'Chord': {
              const ref = childText(el, 'Tuplet');
              const s = ref ? tupletScale(ref) * staffStretch : scale;
              const grace = graceKind(el);
              if (grace === 'before') {
                pendingGrace.push(el);
                break;
              }
              if (grace === 'after') {
                if (lastChord) {
                  const endAt = lastChord.tick + lastChord.ticks;
                  const at = Math.max(lastChord.tick, endAt - GRACE_TICKS);
                  emit(el, at, GRACE_TICKS, true);
                  event(el, at, GRACE_TICKS, 'after', false);
                }
                break;
              }
              const ticks = chordTicks(el, measure.ticks, s);
              const graces = pendingGrace;
              pendingGrace = [];
              graces.forEach((g, i) => {
                const start = cursor - (graces.length - i) * GRACE_TICKS;
                emit(g, start, GRACE_TICKS, true);
                event(g, start, GRACE_TICKS, 'before', false);
              });
              emit(el, cursor, ticks, false);
              event(el, cursor, ticks, null, false);
              lastChord = { tick: cursor, ticks };
              cursor += ticks;
              break;
            }
            case 'Rest': {
              const ref = childText(el, 'Tuplet');
              const ticks = chordTicks(
                el,
                measure.ticks,
                ref ? tupletScale(ref) * staffStretch : scale,
              );
              event(el, cursor, ticks, null, true);
              cursor += ticks;
              break;
            }
            case 'Tuplet': {
              const normal = childNumber(el, 'normalNotes');
              const actual = childNumber(el, 'actualNotes');
              const ratio = normal && actual ? normal / actual : 1;
              const tid = el.getAttribute('id');
              if (tid !== null) {
                tupletDefs.set(tid, {
                  scale: ratio,
                  parent: childText(el, 'Tuplet'),
                  normal: normal ?? 1,
                  actual: actual ?? 1,
                });
              } else {
                tupletSerial += 1;
                tuplets.push({
                  ratio,
                  normal: normal ?? 1,
                  actual: actual ?? 1,
                  key: `t${String(tupletSerial)}`,
                });
              }
              break;
            }
            case 'endTuplet':
              tuplets.pop();
              break;
            case 'location':
              cursor += locationTicks(el);
              break;
            case 'tick':
              cursor = (Number(text(el)) || 0) * tickScale - measure.tick;
              break;
            case 'track':
              w.voice = (Number(text(el)) || 0) % 4;
              break;
            case 'Tempo': {
              const perSecond = childNumber(el, 'tempo');
              if (perSecond && perSecond > 0) {
                tempos.push({ tick: measure.tick + cursor, bpm: perSecond * 60 });
              }
              break;
            }
            case 'Dynamic': {
              const velocity =
                childNumber(el, 'velocity') ?? velocityForDynamic(childText(el, 'subtype'));
              if (velocity !== null && velocity > 0) {
                dynamics.push({ tick: measure.tick + cursor, part, velocity });
              }
              break;
            }
            case 'KeySig': {
              const fifths = keyFifths(el);
              if (fifths !== null && staffOrder === 0) {
                keys.push({
                  tick: measure.tick + cursor,
                  fifths,
                  minor: childText(el, 'mode').toLowerCase() === 'minor',
                });
              }
              break;
            }
            case 'Marker': {
              const label = markerLabel(el);
              if (label && !measure.markers.includes(label)) measure.markers.push(label);
              break;
            }
            case 'Jump':
              measure.jump ??= readJump(el);
              break;
            case 'Volta': {
              const vid = el.getAttribute('id');
              const endings = parseEndings(childText(el, 'endings'));
              if (vid !== null) openVoltas.set(vid, { start: measure.index, endings });
              break;
            }
            case 'endSpanner': {
              const vid = el.getAttribute('id') ?? '';
              const open = openVoltas.get(vid);
              if (open) {
                openVoltas.delete(vid);
                const endIndex = cursor > 0 ? measure.index + 1 : measure.index;
                voltas.push({
                  start: open.start,
                  end: Math.max(open.start + 1, endIndex),
                  endings: open.endings,
                });
              }
              break;
            }
            case 'Clef': {
              const clef = childText(el, 'concertClefType') || childText(el, 'subtype');
              if (clef && w.staff >= 0)
                clefs.push({ staff: w.staff, tick: measure.tick + cursor, clef });
              break;
            }
            case 'Spanner': {
              if (el.getAttribute('type') === 'Slur') {
                if (child(el, 'next')) slurStart = true;
                else if (child(el, 'prev')) slurStop = true;
                break;
              }
              if (el.getAttribute('type') !== 'Volta' || !child(el, 'next')) break;
              const volta = child(el, 'Volta');
              const endings = parseEndings(volta ? childText(volta, 'endings') : '');
              const { measures: span, fractions } = spanLength(el);
              const endIndex = measure.index + span + (fractions > 0 ? 1 : 0);
              voltas.push({
                start: measure.index,
                end: Math.max(measure.index + 1, endIndex),
                endings,
              });
              break;
            }
            case 'RepeatMeasure':
              repeats.push({ staff: w.staff, measure: measure.index, count: 1 });
              cursor += measure.ticks;
              break;
            case 'MeasureRepeat':
              repeats.push({
                staff: w.staff,
                measure: measure.index,
                count: childNumber(el, 'subtype') ?? 1,
              });
              cursor += measure.ticks;
              break;
            default:
              break;
          }
        }
      };

      const voices = childrenNamed(mEl, 'voice');
      for (const el of childElements(mEl)) {
        if (el.tagName === 'Marker' || el.tagName === 'Jump') {
          if (el.tagName === 'Marker') {
            const label = markerLabel(el);
            if (label && !measure.markers.includes(label)) measure.markers.push(label);
          } else {
            measure.jump ??= readJump(el);
          }
        }
      }
      if (voices.length === 0) walk(mEl, 0);
      for (const [i, v] of voices.entries()) walk(v, i);
    });
  });

  for (const [, open] of openVoltas) {
    voltas.push({ start: open.start, end: measures.length, endings: open.endings });
  }

  for (const r of repeats.sort((a, b) => a.measure - b.measure)) {
    if (r.staff < 0) continue;
    const target = measures[r.measure];
    if (!target) continue;
    const source = measures[r.measure - r.count];
    if (!source) continue;
    const shift = target.tick - source.tick;
    const copies = notes
      .filter((n) => n.staff === r.staff && n.measure === source.index)
      .map((n) => ({ ...n, measure: target.index, tick: n.tick + shift }));
    notes.push(...copies);
    events.push(
      ...events
        .filter((e) => e.staff === r.staff && e.measure === source.index)
        .map((e) => ({
          ...e,
          measure: target.index,
          tick: e.tick + shift,
          tuplet: e.tuplet ? { ...e.tuplet } : null,
          tupletKey: e.tupletKey ? `${e.tupletKey}@${String(target.index)}` : null,
        })),
    );
  }

  const uniqueVoltas = voltas.filter(
    (v, i) => voltas.findIndex((o) => o.start === v.start && o.end === v.end) === i,
  );

  if (tempos.length === 0) warnings.push('No tempo marking; playing at 120 bpm');
  markTupletEnds(events);
  for (const staff of staves) {
    const id = [...staffIndexById].find(([, index]) => index === staff.index)?.[0];
    const def = id === undefined ? undefined : defById.get(id);
    if (!clefs.some((c) => c.staff === staff.index && c.tick === 0)) {
      clefs.push({ staff: staff.index, tick: 0, clef: def?.clef ?? 'G' });
    }
  }
  if (!times.some((t) => t.tick === 0)) times.unshift({ tick: 0, n: 4, d: 4 });

  return {
    title: creditOf(score, ['workTitle', 'movementTitle'], ['title', 'title text'], false),
    composer: creditOf(score, ['composer'], ['composer', 'composer text'], true),
    format: 'musescore',
    version,
    parts,
    staves,
    measures,
    voltas: uniqueVoltas.sort((a, b) => a.start - b.start),
    notes: notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch),
    tempos: firstPerTick(tempos),
    dynamics: dynamics.sort((a, b) => a.tick - b.tick),
    keys: firstPerTick(keys),
    notation: {
      events: events.sort((a, b) => a.staff - b.staff || a.tick - b.tick),
      clefs: clefs.sort((a, b) => a.tick - b.tick),
      times,
    },
    warnings,
  };
}
