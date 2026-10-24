import { strToU8, zipSync } from 'fflate';

export type FixtureDuration = 'whole' | 'half' | 'quarter' | 'eighth' | '16th';

export interface FixtureChord {
  pitches?: number[];
  dur: FixtureDuration;
  dots?: number;
  tie?: boolean;
  grace?: boolean;
  triplet?: boolean;
  slur?: 'start' | 'stop';
}

export interface FixtureMeasure {
  staves: FixtureChord[][];
  startRepeat?: boolean;
  endRepeat?: number;
  volta?: { endings: number[]; length: number };
  marker?: string;
  jump?: { to: string; until: string; continueAt?: string };
  tempo?: number;
}

export interface FixtureScore {
  title: string;
  tempo: number;
  time: [number, number];
  fifths: number;
  parts: { name: string; staves: number }[];
  measures: FixtureMeasure[];
}

export type MuseScoreVersion = '2.06' | '3.02' | '4.50';

const QUARTERS: Record<FixtureDuration, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
};

const SHARP_TPC = [14, 21, 16, 23, 18, 13, 20, 15, 22, 17, 24, 19] as const;
const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'] as const;
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] as const;

export function chordQuarters(c: FixtureChord): number {
  let q = QUARTERS[c.dur];
  let add = q;
  for (let d = 0; d < (c.dots ?? 0); d++) {
    add /= 2;
    q += add;
  }
  return c.triplet ? (q * 2) / 3 : q;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function staffCount(score: FixtureScore): number {
  return score.parts.reduce((n, p) => n + p.staves, 0);
}

export function makeMscx(score: FixtureScore, version: MuseScoreVersion): string {
  const v2 = version.startsWith('2');
  const v4 = version.startsWith('4');
  let staffId = 0;
  let spannerId = 100;
  const parts = score.parts
    .map((p) => {
      const defs = Array.from({ length: p.staves }, () => {
        staffId += 1;
        return `<Staff id="${String(staffId)}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>`;
      }).join('');
      return `<Part>${defs}<trackName>${esc(p.name)}</trackName><Instrument><longName>${esc(p.name)}</longName><trackName>${esc(p.name)}</trackName></Instrument></Part>`;
    })
    .join('');

  const voltaEnds = new Map<number, number[]>();
  const staves: string[] = [];
  for (let s = 0; s < staffCount(score); s++) {
    const measures = score.measures.map((m, mi) => {
      const head: string[] = [];
      const body: string[] = [];
      if (m.startRepeat) head.push('<startRepeat/>');
      if (m.endRepeat) head.push(`<endRepeat>${String(m.endRepeat)}</endRepeat>`);
      if (m.marker)
        head.push(`<Marker>${v4 ? '<eid>m</eid>' : ''}<label>${m.marker}</label></Marker>`);
      if (m.jump) {
        head.push(
          `<Jump><jumpTo>${m.jump.to}</jumpTo><playUntil>${m.jump.until}</playUntil><continueAt>${m.jump.continueAt ?? ''}</continueAt></Jump>`,
        );
      }
      if (v2) {
        for (const id of voltaEnds.get(mi) ?? [])
          if (s === 0) body.push(`<endSpanner id="${String(id)}"/>`);
      }
      if (mi === 0) {
        body.push(
          v4
            ? `<KeySig><eid>k</eid><concertKey>${String(score.fifths)}</concertKey></KeySig>`
            : `<KeySig><accidental>${String(score.fifths)}</accidental></KeySig>`,
        );
        body.push(
          `<TimeSig><sigN>${String(score.time[0])}</sigN><sigD>${String(score.time[1])}</sigD></TimeSig>`,
        );
        if (s === 0) body.push(`<Tempo><tempo>${String(score.tempo / 60)}</tempo></Tempo>`);
      } else if (m.tempo && s === 0) {
        body.push(`<Tempo><tempo>${String(m.tempo / 60)}</tempo></Tempo>`);
      }
      if (m.volta && s === 0) {
        const endings = m.volta.endings.join(', ');
        if (v2) {
          spannerId += 1;
          body.push(`<Volta id="${String(spannerId)}"><endings>${endings}</endings></Volta>`);
          const endAt = mi + m.volta.length;
          voltaEnds.set(endAt, [...(voltaEnds.get(endAt) ?? []), spannerId]);
        } else {
          body.push(
            `<Spanner type="Volta"><Volta><endings>${endings}</endings></Volta><next><location><measures>${String(m.volta.length)}</measures></location></next></Spanner>`,
          );
        }
      }
      let inTuplet = false;
      for (const c of m.staves[s] ?? []) {
        if (c.triplet && !inTuplet) {
          spannerId += 1;
          body.push(
            v2
              ? `<Tuplet id="${String(spannerId)}"><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>`
              : '<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>',
          );
          inTuplet = true;
        } else if (!c.triplet && inTuplet) {
          if (!v2) body.push('<endTuplet/>');
          inTuplet = false;
        }
        const dots = c.dots ? `<dots>${String(c.dots)}</dots>` : '';
        const tuplet = v2 && c.triplet ? `<Tuplet>${String(spannerId)}</Tuplet>` : '';
        if (!c.pitches || c.pitches.length === 0) {
          body.push(`<Rest>${tuplet}${dots}<durationType>${c.dur}</durationType></Rest>`);
          continue;
        }
        const notes = c.pitches
          .map((p) => {
            const tie = c.tie
              ? v2
                ? `<Tie id="${String((spannerId += 1))}"/>`
                : `<Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner>`
              : '';
            return `<Note>${tie}<pitch>${String(p)}</pitch><tpc>${String(SHARP_TPC[((p % 12) + 12) % 12] ?? 14)}</tpc></Note>`;
          })
          .join('');
        const slur = !c.slur
          ? ''
          : v2
            ? `<Slur type="${c.slur}" id="900"/>`
            : c.slur === 'start'
              ? '<Spanner type="Slur"><Slur></Slur><next><location><fractions>1/4</fractions></location></next></Spanner>'
              : '<Spanner type="Slur"><prev><location><fractions>-1/4</fractions></location></prev></Spanner>';
        body.push(
          `<Chord>${tuplet}${dots}<durationType>${c.dur}</durationType>${c.grace ? '<acciaccatura/>' : ''}${slur}${notes}</Chord>`,
        );
      }
      if (inTuplet && !v2) body.push('<endTuplet/>');
      const content = v2 ? body.join('') : `<voice>${body.join('')}</voice>`;
      const number = v2 ? ` number="${String(mi + 1)}"` : '';
      return `<Measure${number}>${head.join('')}${content}</Measure>`;
    });
    staves.push(`<Staff id="${String(s + 1)}">${measures.join('')}</Staff>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="${version}"><Score><Division>480</Division><metaTag name="workTitle">${esc(score.title)}</metaTag>${parts}${staves.join('')}</Score></museScore>`;
}

const DIVISIONS = 24;

export function makeMusicXml(score: FixtureScore): string {
  const partList = score.parts
    .map(
      (p, i) =>
        `<score-part id="P${String(i + 1)}"><part-name>${esc(p.name)}</part-name></score-part>`,
    )
    .join('');
  let base = 0;
  const parts = score.parts.map((p, pi) => {
    const first = base;
    base += p.staves;
    const measures = score.measures.map((m, mi) => {
      const out: string[] = [];
      if (m.startRepeat || (m.volta && pi === 0)) {
        const ending = m.volta
          ? `<ending number="${m.volta.endings.join(', ')}" type="start"/>`
          : '';
        out.push(
          `<barline location="left">${ending}${m.startRepeat ? '<repeat direction="forward"/>' : ''}</barline>`,
        );
      }
      if (mi === 0) {
        out.push(
          `<attributes><divisions>${String(DIVISIONS)}</divisions><key><fifths>${String(score.fifths)}</fifths></key><time><beats>${String(score.time[0])}</beats><beat-type>${String(score.time[1])}</beat-type></time><staves>${String(p.staves)}</staves></attributes>`,
        );
        if (pi === 0) out.push(`<sound tempo="${String(score.tempo)}"/>`);
      } else if (m.tempo && pi === 0) {
        out.push(`<sound tempo="${String(m.tempo)}"/>`);
      }
      if (pi === 0 && m.marker) {
        const sound =
          m.marker === 'fine'
            ? 'fine="yes"'
            : m.marker.startsWith('segno')
              ? `segno="${m.marker}"`
              : m.marker === 'coda'
                ? 'tocoda="c"'
                : 'coda="c"';
        out.push(
          `<direction><direction-type><words>${m.marker}</words></direction-type><sound ${sound}/></direction>`,
        );
      }
      for (let s = 0; s < p.staves; s++) {
        let used = 0;
        for (const c of m.staves[first + s] ?? []) {
          const duration = Math.round(chordQuarters(c) * DIVISIONS);
          const time = c.triplet
            ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'
            : '';
          const dots = '<dot/>'.repeat(c.dots ?? 0);
          if (!c.pitches || c.pitches.length === 0) {
            out.push(
              `<note><rest/><duration>${String(duration)}</duration><voice>1</voice><type>${c.dur}</type>${dots}${time}<staff>${String(s + 1)}</staff></note>`,
            );
            used += duration;
            continue;
          }
          c.pitches.forEach((pitch, k) => {
            const pc = ((pitch % 12) + 12) % 12;
            const alter = ALTERS[pc] ? `<alter>${String(ALTERS[pc])}</alter>` : '';
            const tie = c.tie ? '<tie type="start"/>' : '';
            const slur =
              c.slur && k === 0 ? `<notations><slur type="${c.slur}" number="1"/></notations>` : '';
            const grace = c.grace ? '<grace slash="yes"/>' : '';
            const dur = c.grace ? '' : `<duration>${String(duration)}</duration>`;
            out.push(
              `<note>${grace}${k > 0 ? '<chord/>' : ''}<pitch><step>${STEPS[pc] ?? 'C'}</step>${alter}<octave>${String(Math.floor(pitch / 12) - 1)}</octave></pitch>${dur}${tie}<voice>1</voice><type>${c.dur}</type>${dots}${time}<staff>${String(s + 1)}</staff>${slur}</note>`,
            );
          });
          if (!c.grace) used += duration;
        }
        if (s < p.staves - 1 && used > 0)
          out.push(`<backup><duration>${String(used)}</duration></backup>`);
      }
      if (pi === 0 && m.jump) {
        const sound = m.jump.to === 'start' ? 'dacapo="yes"' : `dalsegno="${m.jump.to}"`;
        out.push(
          `<direction><direction-type><words>jump</words></direction-type><sound ${sound}/></direction>`,
        );
      }
      const voltaEnd =
        pi === 0
          ? score.measures.findIndex((o, oi) => o.volta && oi + o.volta.length - 1 === mi)
          : -1;
      const endingStop =
        voltaEnd >= 0
          ? `<ending number="${score.measures[voltaEnd]?.volta?.endings.join(', ') ?? ''}" type="stop"/>`
          : '';
      if (m.endRepeat || endingStop) {
        out.push(
          `<barline location="right">${endingStop}${m.endRepeat ? `<repeat direction="backward" times="${String(m.endRepeat)}"/>` : ''}</barline>`,
        );
      }
      return `<measure number="${String(mi + 1)}">${out.join('')}</measure>`;
    });
    return `<part id="P${String(pi + 1)}">${measures.join('')}</part>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${esc(score.title)}</work-title></work><part-list>${partList}</part-list>${parts.join('')}</score-partwise>`;
}

export function zipScore(
  inner: string,
  content: string,
  extra: Record<string, string> = {},
): Uint8Array {
  const container = `<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="${inner}"/></rootfiles></container>`;
  return zipSync({
    'META-INF/container.xml': new Uint8Array(strToU8(container)),
    [inner]: new Uint8Array(strToU8(content)),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, new Uint8Array(strToU8(v))])),
  });
}

export const PIANO_WALTZ: FixtureScore = {
  title: 'Fixture Waltz',
  tempo: 120,
  time: [3, 4],
  fifths: 1,
  parts: [{ name: 'Piano', staves: 2 }],
  measures: [
    {
      startRepeat: true,
      staves: [
        [
          { pitches: [71], dur: 'quarter' },
          { pitches: [67], dur: 'half', tie: true },
        ],
        [
          { pitches: [43], dur: 'quarter' },
          { pitches: [59, 62], dur: 'quarter' },
          { pitches: [59, 62], dur: 'quarter' },
        ],
      ],
    },
    {
      volta: { endings: [1], length: 1 },
      endRepeat: 2,
      staves: [
        [
          { pitches: [67], dur: 'quarter' },
          { pitches: [69], dur: 'half' },
        ],
        [{ pitches: [50], dur: 'half', dots: 1 }],
      ],
    },
    {
      volta: { endings: [2], length: 1 },
      staves: [
        [
          { pitches: [74], dur: 'eighth', grace: true },
          { pitches: [72], dur: 'eighth', triplet: true, slur: 'start' },
          { pitches: [71], dur: 'eighth', triplet: true },
          { pitches: [69], dur: 'eighth', triplet: true },
          { pitches: [67], dur: 'half', slur: 'stop' },
        ],
        [{ dur: 'quarter' }, { pitches: [55], dur: 'half' }],
      ],
    },
  ],
};
