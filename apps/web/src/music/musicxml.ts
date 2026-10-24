import { beatTicks } from '../metronome/click.ts';
import {
  firstPerTick,
  GRACE_TICKS,
  roleFor,
  staffName,
  TPQ,
  uniqueStaffNames,
  type DynamicMark,
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
import { child, childElements, childNumber, childrenNamed, childText, text } from './xml.ts';

export const STEP_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

interface MeasureFacts {
  nominal: number;
  beat: number;
  extent: number;
  implicit: boolean;
  numberAttr: string;
  startRepeat: boolean;
  endRepeat: number;
  markers: string[];
  jump: { kind: 'dacapo' | 'dalsegno'; segno: string } | null;
  endings: { numbers: number[]; start: boolean; stop: boolean } | null;
}

interface PendingNote {
  staff: number;
  measure: number;
  rel: number;
  ticks: number;
  pitch: number;
  tieForward: boolean;
  grace: boolean;
}

interface Pending<T> {
  measure: number;
  rel: number;
  value: T;
}

function parseEndingNumbers(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

function emptyFacts(): MeasureFacts {
  return {
    nominal: 0,
    beat: TPQ,
    extent: 0,
    implicit: false,
    numberAttr: '',
    startRepeat: false,
    endRepeat: 0,
    markers: [],
    jump: null,
    endings: null,
  };
}

function wordsJump(words: string): { kind: 'dacapo' | 'dalsegno' } | 'fine' | 'tocoda' | null {
  const w = words.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^d\.?\s?c\.?(\s|$)|da capo/.test(w)) return { kind: 'dacapo' };
  if (/^d\.?\s?s\.?(\s|$)|dal segno/.test(w)) return { kind: 'dalsegno' };
  if (w === 'fine') return 'fine';
  if (w.startsWith('to coda')) return 'tocoda';
  return null;
}

export function parseMusicXml(doc: Document): ScoreModel {
  const root = doc.documentElement;
  if (root.tagName !== 'score-partwise') throw new Error('Not a partwise MusicXML file');
  const version = root.getAttribute('version') ?? '';
  const warnings: string[] = [];
  const work = child(root, 'work');
  const title =
    (work ? childText(work, 'work-title') : '') || childText(root, 'movement-title') || '';
  const identification = child(root, 'identification');
  const composer =
    (identification ? childrenNamed(identification, 'creator') : [])
      .find((c) => c.getAttribute('type') === 'composer')
      ?.textContent.trim() ?? '';

  const names = new Map<string, string>();
  const partList = child(root, 'part-list');
  if (partList) {
    for (const sp of childrenNamed(partList, 'score-part')) {
      names.set(
        sp.getAttribute('id') ?? '',
        childText(sp, 'part-name') || childText(sp, 'part-abbreviation'),
      );
    }
  }

  const partEls = childrenNamed(root, 'part');
  if (partEls.length === 0) throw new Error('This MusicXML file has no parts');
  const parts: ScorePart[] = [];
  const staves: ScoreStaff[] = [];
  const facts: MeasureFacts[] = [];
  const pendingNotes: PendingNote[] = [];
  const pendingTempos: Pending<number>[] = [];
  const pendingDynamics: Pending<{ part: number; velocity: number }>[] = [];
  const pendingKeys: Pending<{ fifths: number; minor: boolean }>[] = [];
  const seen = { pitched: false };

  partEls.forEach((partEl, partIndex) => {
    const id = partEl.getAttribute('id') ?? '';
    const measuresEl = childrenNamed(partEl, 'measure');
    let staffCount = 1;
    for (const m of measuresEl) {
      for (const a of childrenNamed(m, 'attributes')) {
        staffCount = Math.max(staffCount, childNumber(a, 'staves') ?? 1);
      }
    }
    const listed = names.get(id) ?? '';
    const name = listed !== '' ? listed : `Part ${String(partIndex + 1)}`;
    const base = staves.length;
    const part: ScorePart = { name, staves: [] };
    for (let s = 0; s < staffCount; s++) {
      const role = roleFor(staffCount, s);
      staves.push({
        index: base + s,
        part: partIndex,
        role,
        name: staffName(name, staffCount, s),
      });
      part.staves.push(base + s);
    }
    parts.push(part);

    let divisions = 1;
    let nominal = 4 * TPQ;
    let beat = TPQ;
    let transpose = 0;
    let pendingGrace: PendingNote[] = [];

    measuresEl.forEach((mEl, mIndex) => {
      const f = (facts[mIndex] ??= emptyFacts());
      if (partIndex === 0) {
        f.implicit = mEl.getAttribute('implicit') === 'yes';
        f.numberAttr = mEl.getAttribute('number') ?? '';
      }
      let cursor = 0;
      let extent = 0;
      let lastStart = 0;
      const toTicks = (d: number) => (d / divisions) * TPQ;

      const readSound = (sound: Element, offset = 0) => {
        const tempo = Number(sound.getAttribute('tempo'));
        if (Number.isFinite(tempo) && tempo > 0) {
          pendingTempos.push({ measure: mIndex, rel: cursor + offset, value: tempo });
        }
        const dyn = Number(sound.getAttribute('dynamics'));
        if (sound.hasAttribute('dynamics') && Number.isFinite(dyn)) {
          pendingDynamics.push({
            measure: mIndex,
            rel: cursor,
            value: { part: partIndex, velocity: Math.max(1, Math.min(127, Math.round(dyn * 0.9))) },
          });
        }
        if (partIndex !== 0) return;
        const segno = sound.getAttribute('segno');
        if (segno !== null) f.markers.push(`segno:${segno}`);
        const coda = sound.getAttribute('coda');
        if (coda !== null) f.markers.push(`coda:${coda}`);
        const tocoda = sound.getAttribute('tocoda');
        if (tocoda !== null) f.markers.push(`tocoda:${tocoda}`);
        if (sound.getAttribute('fine') !== null) f.markers.push('fine');
        if (sound.getAttribute('dacapo') === 'yes') f.jump = { kind: 'dacapo', segno: '' };
        const dalsegno = sound.getAttribute('dalsegno');
        if (dalsegno !== null) f.jump = { kind: 'dalsegno', segno: dalsegno };
      };

      for (const el of childElements(mEl)) {
        switch (el.tagName) {
          case 'attributes': {
            divisions = childNumber(el, 'divisions') ?? divisions;
            const time = child(el, 'time');
            if (time) {
              const beats = childText(time, 'beats')
                .split('+')
                .reduce((sum, b) => sum + (Number(b) || 0), 0);
              const beatType = childNumber(time, 'beat-type') ?? 4;
              if (beats > 0) {
                nominal = (beats * 4 * TPQ) / beatType;
                beat = beatTicks(beats, beatType, TPQ);
              }
            }
            const key = child(el, 'key');
            const fifths = key ? childNumber(key, 'fifths') : null;
            if (fifths !== null && partIndex === 0) {
              pendingKeys.push({
                measure: mIndex,
                rel: cursor,
                value: {
                  fifths,
                  minor: key !== null && childText(key, 'mode').toLowerCase() === 'minor',
                },
              });
            }
            const tr = child(el, 'transpose');
            if (tr) {
              transpose =
                (childNumber(tr, 'chromatic') ?? 0) + 12 * (childNumber(tr, 'octave-change') ?? 0);
            }
            break;
          }
          case 'note': {
            const isChord = child(el, 'chord') !== null;
            const grace = child(el, 'grace') !== null;
            const ticks = toTicks(childNumber(el, 'duration') ?? 0);
            const start = isChord ? lastStart : cursor;
            const pitchEl = child(el, 'pitch');
            const staffNo = Math.min(staffCount, Math.max(1, childNumber(el, 'staff') ?? 1));
            const tieForward = childrenNamed(el, 'tie').some(
              (t) => t.getAttribute('type') === 'start',
            );
            const silent = el.getAttribute('dynamics') === '0';
            if (pitchEl && child(el, 'cue') === null && !silent) {
              seen.pitched = true;
              const step = STEP_SEMITONES[childText(pitchEl, 'step').toUpperCase()] ?? 0;
              const octave = childNumber(pitchEl, 'octave') ?? 4;
              const alter = Math.round(childNumber(pitchEl, 'alter') ?? 0);
              const note: PendingNote = {
                staff: base + staffNo - 1,
                measure: mIndex,
                rel: start,
                ticks,
                pitch: 12 * (octave + 1) + step + alter + transpose,
                tieForward,
                grace,
              };
              if (grace) pendingGrace.push(note);
              else {
                const graces = pendingGrace.filter((g) => g.staff === note.staff);
                pendingGrace = pendingGrace.filter((g) => g.staff !== note.staff);
                graces.forEach((g, gi) => {
                  pendingNotes.push({
                    ...g,
                    measure: mIndex,
                    rel: start - (graces.length - gi) * GRACE_TICKS,
                    ticks: GRACE_TICKS,
                  });
                });
                pendingNotes.push(note);
              }
            }
            if (!grace && !isChord) {
              lastStart = cursor;
              cursor += ticks;
            }
            extent = Math.max(extent, cursor);
            break;
          }
          case 'backup':
            cursor -= toTicks(childNumber(el, 'duration') ?? 0);
            break;
          case 'forward':
            cursor += toTicks(childNumber(el, 'duration') ?? 0);
            extent = Math.max(extent, cursor);
            break;
          case 'sound':
            readSound(el);
            break;
          case 'direction': {
            const sounds = childrenNamed(el, 'sound');
            const offset = toTicks(childNumber(el, 'offset') ?? 0);
            for (const sound of sounds) readSound(sound, offset);
            if (partIndex === 0 && sounds.length === 0) {
              for (const w of Array.from(el.getElementsByTagName('words'))) {
                const meaning = wordsJump(text(w));
                if (meaning === 'fine') f.markers.push('fine');
                else if (meaning === 'tocoda') f.markers.push('tocoda:');
                else if (meaning) f.jump ??= { kind: meaning.kind, segno: '' };
              }
              if (el.getElementsByTagName('segno').length > 0) f.markers.push('segno:');
              if (el.getElementsByTagName('coda').length > 0) f.markers.push('coda:');
            }
            break;
          }
          case 'barline': {
            if (partIndex !== 0) break;
            const repeat = child(el, 'repeat');
            if (repeat?.getAttribute('direction') === 'forward') f.startRepeat = true;
            if (repeat?.getAttribute('direction') === 'backward') {
              f.endRepeat = Math.max(2, Number(repeat.getAttribute('times')) || 2);
            }
            const ending = child(el, 'ending');
            if (ending) {
              const type = ending.getAttribute('type') ?? '';
              const numbers = parseEndingNumbers(ending.getAttribute('number') ?? '');
              f.endings ??= { numbers, start: false, stop: false };
              if (type === 'start') {
                f.endings.start = true;
                f.endings.numbers = numbers;
              } else f.endings.stop = true;
            }
            for (const s of childrenNamed(el, 'sound')) readSound(s);
            break;
          }
          default:
            break;
        }
      }
      f.nominal = Math.max(f.nominal, nominal);
      if (partIndex === 0) f.beat = beat;
      f.extent = Math.max(f.extent, extent);
    });
  });

  if (!seen.pitched) warnings.push('No pitched notes found');

  const measures: ScoreMeasure[] = [];
  let tick = 0;
  let number = 0;
  facts.forEach((f, index) => {
    const ticks = f.implicit && f.extent > 0 ? f.extent : Math.max(f.nominal, f.extent);
    if (!f.implicit) number += 1;
    const written = /^\d+$/.test(f.numberAttr) ? Number(f.numberAttr) : 0;
    if (written >= 1) number = written;
    measures.push({
      index,
      number: Math.max(1, number),
      tick,
      ticks,
      startRepeat: f.startRepeat,
      endRepeat: f.endRepeat,
      markers: [...new Set(f.markers)],
      jump: null,
      sectionEnd: false,
      beat: f.beat,
    });
    tick += ticks;
  });

  const allMarkers = measures.flatMap((m) => m.markers);
  const toCoda = allMarkers.find((m) => m.startsWith('tocoda:'));
  const codaFor = (to: string) => {
    const name = to.slice('tocoda:'.length);
    return (
      allMarkers.find((m) => m === `coda:${name}`) ??
      allMarkers.find((m) => m.startsWith('coda:')) ??
      ''
    );
  };
  facts.forEach((f, index) => {
    if (!f.jump) return;
    const measure = measures[index];
    if (!measure) return;
    const segno =
      f.jump.kind === 'dacapo'
        ? 'start'
        : (allMarkers.find((m) => m === `segno:${f.jump?.segno ?? ''}`) ??
          allMarkers.find((m) => m.startsWith('segno:')) ??
          'start');
    const after = measures.slice(index + 1).flatMap((m) => m.markers);
    const usesCoda = toCoda !== undefined && after.some((m) => m.startsWith('coda:'));
    const jump: Jump = {
      jumpTo: segno,
      playUntil: usesCoda ? toCoda : allMarkers.includes('fine') ? 'fine' : 'end',
      continueAt: usesCoda ? codaFor(toCoda) : '',
      playRepeats: false,
    };
    measure.jump = jump;
  });

  const voltas: Volta[] = [];
  let open: { start: number; endings: number[] } | null = null;
  facts.forEach((f, index) => {
    if (f.endings?.start) open = { start: index, endings: f.endings.numbers };
    if (f.endings?.stop && open) {
      voltas.push({ start: open.start, end: index + 1, endings: open.endings });
      open = null;
    }
  });
  const unclosed = open as { start: number; endings: number[] } | null;
  if (unclosed)
    voltas.push({ start: unclosed.start, end: unclosed.start + 1, endings: unclosed.endings });

  const at = (p: { measure: number; rel: number }) => (measures[p.measure]?.tick ?? 0) + p.rel;
  const notes: ScoreNote[] = pendingNotes.map((n) => ({
    staff: n.staff,
    measure: n.measure,
    pitch: n.pitch,
    tick: at(n),
    ticks: n.ticks,
    tieForward: n.tieForward,
    grace: n.grace,
  }));
  const tempos: TempoMark[] = pendingTempos.map((t) => ({ tick: at(t), bpm: t.value }));
  const dynamics: DynamicMark[] = pendingDynamics.map((d) => ({ tick: at(d), ...d.value }));
  const keys: KeyMark[] = pendingKeys.map((k) => ({ tick: at(k), ...k.value }));
  if (tempos.length === 0) warnings.push('No tempo marking; playing at 120 bpm');
  uniqueStaffNames(staves);

  return {
    title,
    composer,
    format: 'musicxml',
    version,
    parts,
    staves,
    measures,
    voltas,
    notes: notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch),
    tempos: firstPerTick(tempos),
    dynamics: dynamics.sort((a, b) => a.tick - b.tick),
    keys: firstPerTick(keys),
    notation: null,
    warnings,
  };
}
