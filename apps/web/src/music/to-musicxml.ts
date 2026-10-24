import { sectionsOf } from './unroll.ts';
import {
  TPQ,
  type Notation,
  type NotationEvent,
  type ScoreMeasure,
  type ScoreModel,
  type TimeMark,
} from './model.ts';

const DIVISIONS = TPQ * 105;
const STEPS = 'FCGDAEB';
const SHARP_SPELLING = [14, 21, 16, 11, 18, 13, 20, 15, 22, 17, 12, 19] as const;
const FLAGS: Readonly<Record<string, number>> = {
  eighth: 1,
  '16th': 2,
  '32nd': 3,
  '64th': 4,
  '128th': 5,
};
const TYPE_NAMES: Readonly<Record<string, string>> = { longa: 'long' };

const CLEFS: Readonly<Record<string, { sign: string; line: number; octave: number }>> = {
  G: { sign: 'G', line: 2, octave: 0 },
  G8vb: { sign: 'G', line: 2, octave: -1 },
  G8va: { sign: 'G', line: 2, octave: 1 },
  G15mb: { sign: 'G', line: 2, octave: -2 },
  G15ma: { sign: 'G', line: 2, octave: 2 },
  F: { sign: 'F', line: 4, octave: 0 },
  F8vb: { sign: 'F', line: 4, octave: -1 },
  F8va: { sign: 'F', line: 4, octave: 1 },
  F15mb: { sign: 'F', line: 4, octave: -2 },
  C1: { sign: 'C', line: 1, octave: 0 },
  C2: { sign: 'C', line: 2, octave: 0 },
  C3: { sign: 'C', line: 3, octave: 0 },
  C4: { sign: 'C', line: 4, octave: 0 },
  C5: { sign: 'C', line: 5, octave: 0 },
  PERC: { sign: 'percussion', line: 0, octave: 0 },
};

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function spell(
  pitch: number,
  tpc: number | null,
): { step: string; alter: number; octave: number } {
  const t = tpc ?? SHARP_SPELLING[((pitch % 12) + 12) % 12] ?? 14;
  const step = STEPS[(((t + 1) % 7) + 7) % 7] ?? 'C';
  const alter = Math.floor((t + 1) / 7) - 2;
  const octave = Math.floor((pitch - alter) / 12) - 1;
  return { step, alter, octave };
}

function divisions(ticks: number): number {
  return Math.max(0, Math.round(ticks * 105));
}

function beamGroup(time: TimeMark | undefined): number {
  const n = time?.n ?? 4;
  const d = time?.d ?? 4;
  const beat = (TPQ * 4) / d;
  if (d >= 8 && n % 3 === 0 && n > 3) return beat * 3;
  if (d >= 8) return beat * n;
  return beat;
}

export function beamsFor(
  events: readonly NotationEvent[],
  groupTicks: number,
  measureTick: number,
): Map<NotationEvent, string[]> {
  const out = new Map<NotationEvent, string[]>();
  const beams: NotationEvent[][] = [];
  let current: NotationEvent[] = [];
  const close = () => {
    if (current.length > 1) beams.push(current);
    current = [];
  };
  for (const e of events) {
    const levels = e.rest || e.grace ? 0 : (FLAGS[e.type] ?? 0);
    if (levels === 0 || e.beam === 'no') {
      close();
      continue;
    }
    const previous = current.at(-1);
    const sameGroup =
      previous !== undefined &&
      Math.floor((previous.tick - measureTick) / groupTicks) ===
        Math.floor((e.tick - measureTick) / groupTicks) &&
      Math.abs(previous.tick + previous.ticks - e.tick) < 1;
    const joins =
      previous !== undefined &&
      (e.beam === 'mid' ||
        e.beam === 'begin32' ||
        e.beam === 'begin64' ||
        (e.beam === 'auto' && sameGroup));
    if (!joins || e.beam === 'begin') close();
    current.push(e);
  }
  close();
  for (const beam of beams) {
    const levels = beam.map((e) => FLAGS[e.type] ?? 1);
    const maxLevel = Math.max(...levels);
    const labels = beam.map(() => [] as string[]);
    for (let level = 1; level <= maxLevel; level++) {
      let i = 0;
      while (i < beam.length) {
        if ((levels[i] ?? 0) < level) {
          i += 1;
          continue;
        }
        let j = i;
        while (j + 1 < beam.length && (levels[j + 1] ?? 0) >= level) {
          const next = beam[j + 1];
          if (
            level > 1 &&
            next &&
            (next.beam === 'begin32' || (next.beam === 'begin64' && level > 2))
          )
            break;
          j += 1;
        }
        if (level === 1 || j > i) {
          for (let k = i; k <= j; k++) {
            labels[k]?.push(k === i ? 'begin' : k === j ? 'end' : 'continue');
          }
        } else {
          labels[i]?.push(i === 0 ? 'forward hook' : 'backward hook');
        }
        i = j + 1;
      }
    }
    beam.forEach((e, k) => out.set(e, labels[k] ?? []));
  }
  return out;
}

function latestAt<T extends { tick: number }>(items: readonly T[], tick: number): T | undefined {
  let found: T | undefined;
  for (const item of items) if (item.tick <= tick) found = item;
  return found;
}

function clefXml(clef: string, staffNo: number): string {
  const c = CLEFS[clef] ?? CLEFS['G'];
  if (!c) return '';
  const line = c.line > 0 ? `<line>${String(c.line)}</line>` : '';
  const octave =
    c.octave !== 0 ? `<clef-octave-change>${String(c.octave)}</clef-octave-change>` : '';
  return `<clef number="${String(staffNo)}"><sign>${c.sign}</sign>${line}${octave}</clef>`;
}

function markerXml(label: string): string {
  if (label.startsWith('segno')) {
    return `<direction placement="above"><direction-type><segno/></direction-type><sound segno="${esc(label)}"/></direction>`;
  }
  if (label.startsWith('codab') || label === 'varcoda' || label === 'codetta') {
    return `<direction placement="above"><direction-type><coda/></direction-type><sound coda="${esc(label)}"/></direction>`;
  }
  if (label.startsWith('fine')) {
    return `<direction placement="above"><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>`;
  }
  if (label.startsWith('coda') || label.startsWith('toCoda')) {
    return `<direction placement="above"><direction-type><words>To Coda</words></direction-type><sound tocoda="${esc(label)}"/></direction>`;
  }
  return '';
}

function jumpXml(measure: ScoreMeasure): string {
  const jump = measure.jump;
  if (!jump) return '';
  const name = jump.jumpTo === 'start' ? 'D.C.' : 'D.S.';
  const until =
    jump.playUntil === 'end'
      ? ''
      : jump.continueAt
        ? ' al Coda'
        : jump.playUntil.startsWith('fine')
          ? ' al Fine'
          : '';
  const sound = jump.jumpTo === 'start' ? 'dacapo="yes"' : `dalsegno="${esc(jump.jumpTo)}"`;
  return `<direction placement="above"><direction-type><words>${name}${until}</words></direction-type><sound ${sound}/></direction>`;
}

export function toMusicXml(score: ScoreModel, notation: Notation): string {
  const tiedInto = new Set<string>();
  const byStaff = new Map<number, NotationEvent[]>();
  const byStaffMeasure = new Map<string, NotationEvent[]>();
  for (const e of notation.events) {
    const list = byStaff.get(e.staff) ?? [];
    list.push(e);
    byStaff.set(e.staff, list);
    const key = `${String(e.staff)}:${String(e.measure)}`;
    const inBar = byStaffMeasure.get(key) ?? [];
    inBar.push(e);
    byStaffMeasure.set(key, inBar);
  }
  for (const [, list] of byStaff) {
    for (const e of list) {
      if (e.rest || e.grace) continue;
      for (const n of e.notes) {
        if (n.tieForward)
          tiedInto.add(
            `${String(e.staff)}:${String(n.pitch)}:${String(Math.round(e.tick + e.ticks))}`,
          );
      }
    }
  }

  const impliedStarts = new Set<number>();
  for (const section of sectionsOf(score.measures)) {
    if (section.start === 0) continue;
    for (let i = section.start; i < section.end; i++) {
      const m = score.measures[i];
      if (m?.startRepeat) break;
      if (m && m.endRepeat > 0) {
        impliedStarts.add(section.start);
        break;
      }
    }
  }

  const partList = score.parts
    .map(
      (p, i) =>
        `<score-part id="P${String(i + 1)}"><part-name>${esc(p.name)}</part-name></score-part>`,
    )
    .join('');

  const parts = score.parts.map((part, partIndex) => {
    const measures = score.measures.map((m) => {
      const out: string[] = [];
      const attrs: string[] = [];
      if (m.index === 0) attrs.push(`<divisions>${String(DIVISIONS)}</divisions>`);
      const key = score.keys.find((k) => Math.abs(k.tick - m.tick) < 1);
      if (key || m.index === 0) {
        attrs.push(
          `<key><fifths>${String(key?.fifths ?? 0)}</fifths>${key?.minor ? '<mode>minor</mode>' : ''}</key>`,
        );
      }
      const time = notation.times.find((t) => Math.abs(t.tick - m.tick) < 1);
      if (time)
        attrs.push(
          `<time><beats>${String(time.n)}</beats><beat-type>${String(time.d)}</beat-type></time>`,
        );
      if (m.index === 0) attrs.push(`<staves>${String(part.staves.length)}</staves>`);
      part.staves.forEach((staff, k) => {
        const clef =
          notation.clefs.find((c) => c.staff === staff && Math.abs(c.tick - m.tick) < 1) ??
          (m.index === 0 ? { clef: 'G' } : undefined);
        if (clef) attrs.push(clefXml(clef.clef, k + 1));
      });
      if (attrs.length > 0) out.push(`<attributes>${attrs.join('')}</attributes>`);

      const volta = score.voltas.find((v) => v.start === m.index);
      const startRepeat = m.startRepeat || impliedStarts.has(m.index);
      if (startRepeat || volta) {
        out.push(
          `<barline location="left">${startRepeat ? '<bar-style>heavy-light</bar-style>' : ''}${volta ? `<ending number="${volta.endings.join(', ')}" type="start"/>` : ''}${startRepeat ? '<repeat direction="forward"/>' : ''}</barline>`,
        );
      }
      if (partIndex === 0) {
        for (const label of m.markers) out.push(markerXml(label));
        for (const t of score.tempos.filter(
          (t) => t.tick >= m.tick - 0.5 && t.tick < m.tick + m.ticks - 0.5,
        )) {
          const offset = divisions(t.tick - m.tick);
          out.push(
            `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${String(Math.round(t.bpm))}</per-minute></metronome></direction-type>${offset > 0 ? `<offset sound="yes">${String(offset)}</offset>` : ''}<sound tempo="${String(Number(t.bpm.toFixed(6)))}"/></direction>`,
          );
        }
      }

      const group = beamGroup(latestAt(notation.times, m.tick));
      part.staves.forEach((staff, k) => {
        const inMeasure = byStaffMeasure.get(`${String(staff)}:${String(m.index)}`) ?? [];
        const voices = [...new Set(inMeasure.map((e) => e.voice))].sort((a, b) => a - b);
        for (const voice of voices) {
          const events = inMeasure
            .filter((e) => e.voice === voice)
            .sort(
              (a, b) =>
                a.tick - b.tick ||
                (a.grace === 'before' ? -1 : 0) - (b.grace === 'before' ? -1 : 0),
            );
          const beams = beamsFor(
            events.filter((e) => !e.grace),
            group,
            m.tick,
          );
          let cursor = 0;
          const voiceNo = k * 4 + voice + 1;
          for (const e of events) {
            const rel = e.tick - m.tick;
            if (!e.grace && rel > cursor + 0.5) {
              out.push(
                `<forward><duration>${String(divisions(rel - cursor))}</duration><voice>${String(voiceNo)}</voice><staff>${String(k + 1)}</staff></forward>`,
              );
              cursor = rel;
            }
            const type = e.measureRest
              ? ''
              : `<type>${TYPE_NAMES[e.type] ?? e.type}</type>${'<dot/>'.repeat(e.dots)}`;
            const tm = e.tuplet
              ? `<time-modification><actual-notes>${String(e.tuplet.actual)}</actual-notes><normal-notes>${String(e.tuplet.normal)}</normal-notes></time-modification>`
              : '';
            const beamXml = (beams.get(e) ?? [])
              .map((b, level) => `<beam number="${String(level + 1)}">${b}</beam>`)
              .join('');
            const duration = e.grace ? '' : `<duration>${String(divisions(e.ticks))}</duration>`;
            const grace = e.grace ? '<grace slash="yes"/>' : '';
            if (e.rest || e.notes.length === 0) {
              out.push(
                `<note><rest${e.measureRest ? ' measure="yes"' : ''}/>${duration}<voice>${String(voiceNo)}</voice>${type}${tm}<staff>${String(k + 1)}</staff>${e.tuplet?.start || e.tuplet?.stop ? `<notations>${e.tuplet.start ? '<tuplet type="start"/>' : ''}${e.tuplet.stop ? '<tuplet type="stop"/>' : ''}</notations>` : ''}</note>`,
              );
            } else {
              e.notes.forEach((n, i) => {
                const { step, alter, octave } = spell(n.pitch, n.tpc);
                const stop = tiedInto.has(
                  `${String(e.staff)}:${String(n.pitch)}:${String(Math.round(e.tick))}`,
                );
                const ties = `${stop ? '<tie type="stop"/>' : ''}${n.tieForward ? '<tie type="start"/>' : ''}`;
                const notations = [
                  stop ? '<tied type="stop"/>' : '',
                  n.tieForward ? '<tied type="start"/>' : '',
                  i === 0 && e.tuplet?.start ? '<tuplet type="start"/>' : '',
                  i === 0 && e.tuplet?.stop ? '<tuplet type="stop"/>' : '',
                  i === 0 && e.slurStart ? '<slur type="start" number="1"/>' : '',
                  i === 0 && e.slurStop ? '<slur type="stop" number="1"/>' : '',
                ].join('');
                out.push(
                  `<note${n.silent ? ' dynamics="0"' : ''}>${grace}${i > 0 ? '<chord/>' : ''}<pitch><step>${step}</step>${alter !== 0 ? `<alter>${String(alter)}</alter>` : ''}<octave>${String(octave)}</octave></pitch>${duration}${ties}<voice>${String(voiceNo)}</voice>${type}${tm}<staff>${String(k + 1)}</staff>${i === 0 ? beamXml : ''}${notations ? `<notations>${notations}</notations>` : ''}</note>`,
                );
              });
            }
            if (!e.grace) cursor = rel + e.ticks;
          }
          if (cursor > 0.5)
            out.push(`<backup><duration>${String(divisions(cursor))}</duration></backup>`);
        }
      });

      if (partIndex === 0) out.push(jumpXml(m));
      const voltaEnd = score.voltas.find((v) => v.end - 1 === m.index);
      if (m.endRepeat > 0 || voltaEnd) {
        const ending = voltaEnd
          ? `<ending number="${voltaEnd.endings.join(', ')}" type="${m.endRepeat > 0 ? 'stop' : 'discontinue'}"/>`
          : '';
        out.push(
          `<barline location="right">${m.endRepeat > 0 ? '<bar-style>light-heavy</bar-style>' : ''}${ending}${m.endRepeat > 0 ? `<repeat direction="backward" times="${String(m.endRepeat)}"/>` : ''}</barline>`,
        );
      }
      const latest = latestAt(notation.times, m.tick);
      const nominal = latest ? (latest.n * 4 * TPQ) / latest.d : m.ticks;
      const implicit = m.ticks < nominal - 0.5 ? ' implicit="yes"' : '';
      return `<measure number="${String(m.number)}"${implicit}>${out.join('')}</measure>`;
    });
    return `<part id="P${String(partIndex + 1)}">${measures.join('')}</part>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${esc(score.title)}</work-title></work><part-list>${partList}</part-list>${parts.join('')}</score-partwise>`;
}
