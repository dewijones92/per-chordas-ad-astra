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
  fingers?: (string | null)[];
  fingerStyle?: 'fingering' | 'lhGuitarFingering' | 'rhGuitarFingering' | 'stringNumber';
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
  composer?: string;
  tempo: number;
  time: [number, number];
  fifths: number;
  parts: { name: string; staves: number; instrument?: string; tab?: boolean }[];
  measures: FixtureMeasure[];
}

export type MuseScoreVersion = '1.14' | '2.06' | '3.02' | '4.50';

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
  if (version === '1.14') return makeMscx114(score);
  const v2 = version.startsWith('2');
  const v4 = version.startsWith('4');
  let staffId = 0;
  let spannerId = 100;
  const parts = score.parts
    .map((p) => {
      const defs = Array.from({ length: p.staves }, () => {
        staffId += 1;
        return p.tab
          ? `<Staff id="${String(staffId)}"><StaffType group="tablature"><name>tab6StrCommon</name></StaffType></Staff>`
          : `<Staff id="${String(staffId)}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>`;
      }).join('');
      const id = p.instrument ? (p.instrument.split('.').at(-1) ?? '') : '';
      return `<Part>${defs}<trackName>${esc(p.name)}</trackName><Instrument${v4 && id ? ` id="${id}"` : ''}><longName>${esc(p.name)}</longName><trackName>${esc(p.name)}</trackName>${p.instrument ? `<instrumentId>${p.instrument}</instrumentId>` : ''}</Instrument></Part>`;
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
          .map((p, pi) => {
            const finger = c.fingers?.[pi];
            const fingering = finger
              ? `<Fingering>${c.fingerStyle && c.fingerStyle !== 'fingering' ? `<style>${c.fingerStyle}</style>` : ''}<text>${esc(finger)}</text></Fingering>`
              : '';
            const tie = c.tie
              ? v2
                ? `<Tie id="${String((spannerId += 1))}"/>`
                : `<Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner>`
              : '';
            return `<Note>${fingering}${tie}<pitch>${String(p)}</pitch><tpc>${String(SHARP_TPC[((p % 12) + 12) % 12] ?? 14)}</tpc></Note>`;
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
<museScore version="${version}"><Score><Division>480</Division><metaTag name="workTitle">${esc(score.title)}</metaTag>${score.composer ? `<metaTag name="composer">${esc(score.composer)}</metaTag>` : ''}${parts}${staves.join('')}</Score></museScore>`;
}

const DIVISION_114 = 480;
const FINGER_114: Record<NonNullable<FixtureChord['fingerStyle']>, string> = {
  fingering: 'Fingering',
  lhGuitarFingering: 'LH Guitar Fingering',
  rhGuitarFingering: 'RH Guitar Fingering',
  stringNumber: 'StringNumber',
};

function html114(lines: readonly string[]): string {
  const paragraphs = lines.map((line) => `<p style=" margin-top:0px;">${esc(line)}</p>`).join('\n');
  return `<html-data>\n<html><head><meta name="qrichtext" content="1" /><style type="text/css">\np, li { white-space: pre-wrap; }\n</style></head><body style=" font-family:'Times New Roman';">\n${paragraphs}</body></html>\n</html-data>`;
}

function makeMscx114(score: FixtureScore): string {
  const [n, d] = score.time;
  const barTicks = (n * 4 * DIVISION_114) / d;
  const key = score.fifths < 0 ? score.fifths + 16 : score.fifths;
  const parts = score.parts
    .map((p) => {
      const defs = Array.from({ length: p.staves }, (_, i) => {
        const clef = p.staves === 2 && i === 1 ? 4 : 0;
        return `<Staff><cleflist><clef tick="0" idx="${String(clef)}"/></cleflist><keylist><key tick="0" idx="${String(score.fifths)}"/></keylist></Staff>`;
      }).join('');
      return `<Part>${defs}<name><style>9</style><subtype>InstrumentLong</subtype>${html114([p.name])}</name><Instrument><trackName>${esc(p.name)}</trackName>${p.instrument ? `<instrumentId>${p.instrument}</instrumentId>` : ''}</Instrument></Part>`;
    })
    .join('');
  const voltas = score.measures
    .flatMap((m, mi) =>
      m.volta
        ? [
            `<Volta><subtype>1</subtype><tick>${String(mi * barTicks)}</tick><tick2>${String((mi + m.volta.length) * barTicks)}</tick2><endings>${m.volta.endings.join(',')}</endings></Volta>`,
          ]
        : [],
    )
    .join('');
  const tempos = [
    `<tempo tick="0">${String(score.tempo / 60)}</tempo>`,
    ...score.measures.flatMap((m, mi) =>
      m.tempo ? [`<tempo tick="${String(mi * barTicks)}">${String(m.tempo / 60)}</tempo>`] : [],
    ),
  ].join('');
  let tupletId = 0;
  let slurId = 0;
  const staves: string[] = [];
  for (let s = 0; s < staffCount(score); s++) {
    const credits =
      s === 0
        ? `<VBox><Text><style>2</style><subtype>Title</subtype>${html114([score.title])}</Text>${score.composer ? `<Text><style>4</style><subtype>Composer</subtype>${html114([score.composer, '(1900 - 2000)'])}</Text>` : ''}</VBox>`
        : '';
    const measures = score.measures.map((m, mi) => {
      const body: string[] = [];
      if (m.startRepeat) body.push('<startRepeat/>');
      if (m.endRepeat) body.push(`<endRepeat>${String(m.endRepeat)}</endRepeat>`);
      if (m.marker)
        body.push(`<Marker><subtype>Repeat</subtype><label>${m.marker}</label></Marker>`);
      if (m.jump) {
        body.push(
          `<Jump><subtype>Repeat</subtype><jumpTo>${m.jump.to}</jumpTo><playUntil>${m.jump.until}</playUntil><continueAt>${m.jump.continueAt ?? ''}</continueAt></Jump>`,
        );
      }
      if (mi === 0) {
        body.push(`<KeySig><subtype>${String(key)}</subtype></KeySig>`);
        body.push(
          `<TimeSig><subtype>${String(n * 64 + d)}</subtype><den>${String(d)}</den><nom1>${String(n)}</nom1></TimeSig>`,
        );
      }
      const bpm = mi === 0 ? score.tempo : m.tempo;
      if (bpm && s === 0)
        body.push(`<Tempo><tempo>${String(bpm / 60)}</tempo><subtype>Tempo</subtype></Tempo>`);
      let inTuplet = false;
      let first = true;
      for (const c of m.staves[s] ?? []) {
        if (c.triplet && !inTuplet) {
          tupletId += 1;
          body.push(
            `<Tuplet id="${String(tupletId)}"><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>${c.dur}</baseNote></Tuplet>`,
          );
          inTuplet = true;
        } else if (!c.triplet) {
          inTuplet = false;
        }
        const tick = first && !c.grace ? `<tick>${String(mi * barTicks)}</tick>` : '';
        if (!c.grace) first = false;
        const track = `<track>${String(s * 4)}</track>`;
        const dots = c.dots ? `<dots>${String(c.dots)}</dots>` : '';
        const tuplet = c.triplet ? `<Tuplet>${String(tupletId)}</Tuplet>` : '';
        if (!c.pitches || c.pitches.length === 0) {
          body.push(
            `<Rest>${tick}${track}${tuplet}${dots}<durationType>${c.dur}</durationType></Rest>`,
          );
          continue;
        }
        if (c.slur === 'start') slurId += 1;
        const slur = c.slur ? `<Slur type="${c.slur}" number="${String(slurId)}"/>` : '';
        const notes = c.pitches
          .map((p, pi) => {
            const finger = c.fingers?.[pi];
            const fingering = finger
              ? `<Text><style>8</style><subtype>${FINGER_114[c.fingerStyle ?? 'fingering']}</subtype>${html114([finger])}</Text>`
              : '';
            const tie = c.tie ? '<Tie><up>2</up></Tie>' : '';
            return `<Note><pitch>${String(p)}</pitch><tpc>${String(SHARP_TPC[((p % 12) + 12) % 12] ?? 14)}</tpc>${tie}${fingering}</Note>`;
          })
          .join('');
        body.push(
          `<Chord>${tick}${track}${tuplet}${dots}<durationType>${c.dur}</durationType>${c.grace ? '<acciaccatura/>' : ''}${slur}${notes}</Chord>`,
        );
      }
      return `<Measure number="${String(mi + 1)}">${body.join('')}</Measure>`;
    });
    staves.push(`<Staff id="${String(s + 1)}">${credits}${measures.join('')}</Staff>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="1.14"><programVersion>1.3</programVersion><programRevision>5702</programRevision><Division>${String(DIVISION_114)}</Division><siglist><sig tick="0"><nom>${String(n)}</nom><denom>${String(d)}</denom></sig></siglist><tempolist fix="2">${tempos}</tempolist>${parts}${voltas}${staves.join('')}</museScore>`;
}

const DIVISIONS = 24;

export function makeMusicXml(score: FixtureScore): string {
  const partList = score.parts
    .map(
      (p, i) =>
        `<score-part id="P${String(i + 1)}"><part-name>${esc(p.name)}</part-name>${p.instrument ? `<score-instrument id="P${String(i + 1)}-I1"><instrument-name>${esc(p.name)}</instrument-name><instrument-sound>${p.instrument}</instrument-sound></score-instrument>` : ''}</score-part>`,
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
            const finger = c.fingers?.[k];
            const technical = !finger
              ? ''
              : c.fingerStyle === 'rhGuitarFingering'
                ? `<technical><pluck>${esc(finger)}</pluck></technical>`
                : c.fingerStyle === 'stringNumber'
                  ? `<technical><string>${esc(finger)}</string></technical>`
                  : `<technical><fingering>${esc(finger)}</fingering></technical>`;
            const slurMark = c.slur && k === 0 ? `<slur type="${c.slur}" number="1"/>` : '';
            const slur =
              slurMark || technical ? `<notations>${slurMark}${technical}</notations>` : '';
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
<score-partwise version="4.0"><work><work-title>${esc(score.title)}</work-title></work>${score.composer ? `<identification><creator type="composer">${esc(score.composer)}</creator></identification>` : ''}<part-list>${partList}</part-list>${parts.join('')}</score-partwise>`;
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
  composer: 'Fixture Composer',
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

export const GUITAR_STYLE_WALTZ: FixtureScore = {
  title: 'Guitar Style Waltz',
  tempo: 120,
  time: [3, 4],
  fifths: 0,
  parts: [
    { name: 'Piano', staves: 1 },
    { name: 'Piano', staves: 1 },
  ],
  measures: [
    {
      staves: [
        [{ pitches: [55, 67], dur: 'half', dots: 1 }],
        [
          { pitches: [48], dur: 'quarter' },
          { pitches: [60, 64], dur: 'quarter' },
          { pitches: [60, 64], dur: 'quarter' },
        ],
      ],
    },
  ],
};
