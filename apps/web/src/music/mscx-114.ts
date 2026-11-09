import { QUARTERS } from './model.ts';
import { child, childElements, childNumber, childrenNamed, childText, text } from './xml.ts';

export interface Legacy114 {
  tempos: { tick: number; bpm: number }[];
  voltas: { tick: number; tick2: number; endings: string }[];
  clefs: { staffId: number; tick: number; clef: string }[];
}

interface Sig {
  tick: number;
  actual: [number, number];
  nominal: [number, number];
}

const CLEFS_114 = [
  'G',
  'G8va',
  'G15ma',
  'G8vb',
  'F',
  'F8vb',
  'F15mb',
  'F',
  'F',
  'C1',
  'C2',
  'C3',
  'C4',
  'G',
  'PERC',
  'C5',
  'G',
  'F8va',
  'F',
  'PERC',
  'G',
] as const;

const TWO_NOTE_TREMOLOS = new Set([3, 4, 5]);

const CREDITS = new Set(['title', 'subtitle', 'composer', 'poet', 'lyricist', 'translator']);

export function isMuseScore1(doc: Document): boolean {
  const root = doc.documentElement;
  if (root.tagName !== 'museScore' || child(root, 'Score')) return false;
  const major = Number.parseInt(root.getAttribute('version') ?? '', 10);
  return Number.isFinite(major) && major < 2;
}

function clefName(idx: string): string {
  return CLEFS_114[Number(idx)] ?? 'G';
}

function append(doc: Document, parent: Element, name: string, value: string): Element {
  const el = doc.createElement(name);
  el.textContent = value;
  parent.appendChild(el);
  return el;
}

function plainText(el: Element): string {
  const html = child(el, 'html-data');
  if (!html) return childText(el, 'text');
  const paragraphs = Array.from(html.getElementsByTagName('p'));
  const lines = paragraphs.length > 0 ? paragraphs.map((p) => p.textContent) : [html.textContent];
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

function readSigs(root: Element): Sig[] {
  const list = child(root, 'siglist');
  if (!list) return [];
  return childrenNamed(list, 'sig')
    .map((sig) => {
      const nom = childNumber(sig, 'nom') ?? 4;
      const denom = childNumber(sig, 'denom') ?? 4;
      const actual: [number, number] = [nom, denom];
      const nominal: [number, number] = [
        childNumber(sig, 'nom2') ?? nom,
        childNumber(sig, 'denom2') ?? denom,
      ];
      return { tick: Number(sig.getAttribute('tick') ?? 0), actual, nominal };
    })
    .sort((a, b) => a.tick - b.tick);
}

function sigAt(sigs: readonly Sig[], tick: number): Sig | undefined {
  let found: Sig | undefined;
  for (const sig of sigs) if (sig.tick <= tick) found = sig;
  return found;
}

function upgradeStaffDefs(doc: Document, root: Element, out: Legacy114): void {
  let staffId = 0;
  for (const part of childrenNamed(root, 'Part')) {
    const drums = ['1', 'true'].includes(
      childText(child(part, 'Instrument') ?? part, 'useDrumset'),
    );
    for (const staff of childrenNamed(part, 'Staff')) {
      staffId += 1;
      const id = staff.hasAttribute('id') ? Number(staff.getAttribute('id')) : staffId;
      const clefs = childrenNamed(child(staff, 'cleflist') ?? staff, 'clef');
      for (const clef of clefs) {
        const tick = Number(clef.getAttribute('tick') ?? 0);
        const name = clefName(clef.getAttribute('idx') ?? '0');
        if (tick === 0) {
          if (!child(staff, 'defaultClef')) append(doc, staff, 'defaultClef', name);
        } else {
          out.clefs.push({ staffId: id, tick, clef: name });
        }
      }
      if (drums && !child(staff, 'StaffType')) {
        append(doc, staff, 'StaffType', '').setAttribute('group', 'percussion');
      }
    }
  }
}

function upgradeText(doc: Document, el: Element, style: string): void {
  const value = plainText(el);
  const styleEl = child(el, 'style');
  if (styleEl) styleEl.textContent = style;
  else append(doc, el, 'style', style);
  if (!child(el, 'text')) append(doc, el, 'text', value);
}

function playHalf(doc: Document, chord: Element): void {
  const quarters = QUARTERS[childText(chord, 'durationType')];
  if (quarters === undefined || child(chord, 'duration')) return;
  let total = quarters;
  let add = quarters;
  for (let d = 0; d < (childNumber(chord, 'dots') ?? 0); d++) {
    add /= 2;
    total += add;
  }
  append(doc, chord, 'duration', `${String(Math.round(total * 256))}/2048`);
}

function upgradeOldNote(doc: Document, note: Element): void {
  for (const name of ['pitch', 'tpc']) {
    const value = note.getAttribute(name);
    if (value !== null && !child(note, name)) append(doc, note, name, value);
  }
}

function upgradeMeasure(
  doc: Document,
  measure: Element,
  sig: Sig | undefined,
  division: number,
  openingKey: number | null,
): void {
  if (sig && !measure.hasAttribute('len')) {
    measure.setAttribute('len', `${String(sig.actual[0])}/${String(sig.actual[1])}`);
  }
  if (openingKey !== null && !child(measure, 'KeySig')) {
    const key = doc.createElement('KeySig');
    append(doc, key, 'accidental', String(openingKey));
    measure.insertBefore(key, measure.firstElementChild);
  }
  let previousChord = new Map<number, Element>();
  for (const el of childElements(measure)) {
    if (el.tagName === 'Chord' || el.tagName === 'Rest') {
      const ticklen = childNumber(el, 'ticklen');
      if (ticklen !== null && !child(el, 'durationType')) {
        append(doc, el, 'duration', `${String(ticklen)}/${String(division * 4)}`);
      }
      for (const note of childrenNamed(el, 'Note')) upgradeOldNote(doc, note);
    }
    if (el.tagName === 'Chord') {
      const track = childNumber(el, 'track') ?? -1;
      const tremolo = child(el, 'Tremolo');
      if (tremolo && TWO_NOTE_TREMOLOS.has(childNumber(tremolo, 'subtype') ?? -1)) {
        const first = previousChord.get(track);
        if (first) playHalf(doc, first);
        playHalf(doc, el);
      }
      previousChord = new Map(previousChord).set(track, el);
    }
    const tick = child(el, 'tick');
    if (tick && el.tagName !== 'tick') {
      const marker = doc.createElement('tick');
      marker.textContent = text(tick);
      measure.insertBefore(marker, el);
    }
    if (el.tagName === 'TimeSig' && !child(el, 'sigN')) {
      const parts = ['nom1', 'nom2', 'nom3', 'nom4'].map((n) => childNumber(el, n) ?? 0);
      const sum = parts.reduce((a, b) => a + b, 0);
      const n = sum > 0 ? sum : (sig?.nominal[0] ?? 4);
      const d = childNumber(el, 'den') ?? sig?.nominal[1] ?? 4;
      append(doc, el, 'sigN', String(n));
      append(doc, el, 'sigD', String(d));
    }
    if (el.tagName === 'KeySig' && !child(el, 'accidental') && !child(el, 'key')) {
      const raw = childNumber(el, 'subtype');
      if (raw !== null) {
        const low = raw & 0xf;
        append(doc, el, 'accidental', String(low > 7 ? low - 16 : low));
      }
    }
    if (el.tagName === 'Clef') {
      const subtype = child(el, 'subtype');
      if (subtype && /^\d+$/.test(text(subtype))) subtype.textContent = clefName(text(subtype));
    }
    if (el.tagName === 'Chord') {
      for (const note of childrenNamed(el, 'Note')) {
        for (const t of childrenNamed(note, 'Text')) {
          const subtype = childText(t, 'subtype');
          if (!/finger|string/i.test(subtype)) continue;
          const finger = doc.createElement('Fingering');
          append(doc, finger, 'style', subtype);
          append(doc, finger, 'text', plainText(t));
          note.replaceChild(finger, t);
        }
      }
    }
  }
}

export function upgradeMuseScore1(doc: Document): Legacy114 {
  const root = doc.documentElement;
  const out: Legacy114 = { tempos: [], voltas: [], clefs: [] };
  const division = childNumber(root, 'Division') ?? 480;
  const sigs = readSigs(root);

  upgradeStaffDefs(doc, root, out);

  const tempolist = child(root, 'tempolist');
  for (const tempo of tempolist ? childrenNamed(tempolist, 'tempo') : []) {
    const perSecond = Number(text(tempo));
    if (perSecond > 0) {
      out.tempos.push({ tick: Number(tempo.getAttribute('tick') ?? 0), bpm: perSecond * 60 });
    }
  }
  for (const volta of childrenNamed(root, 'Volta')) {
    const tick = childNumber(volta, 'tick');
    const tick2 = childNumber(volta, 'tick2');
    if (tick !== null && tick2 !== null && tick2 > tick) {
      out.voltas.push({ tick, tick2, endings: childText(volta, 'endings') });
    }
  }

  const keylist = childrenNamed(root, 'Part')
    .flatMap((part) => childrenNamed(part, 'Staff'))
    .map((staff) => child(staff, 'keylist'))[0];
  const openingKey = Number(
    (keylist ? childrenNamed(keylist, 'key') : [])
      .find((k) => k.getAttribute('tick') === '0')
      ?.getAttribute('idx') ?? 0,
  );

  for (const staff of childrenNamed(root, 'Staff')) {
    let tick = 0;
    let first = true;
    for (const el of childElements(staff)) {
      if (el.tagName === 'VBox' || el.tagName === 'HBox' || el.tagName === 'TBox') {
        for (const t of childrenNamed(el, 'Text')) {
          const subtype = childText(t, 'subtype').toLowerCase();
          if (CREDITS.has(subtype)) upgradeText(doc, t, subtype);
        }
        continue;
      }
      if (el.tagName !== 'Measure') continue;
      const sig = sigAt(sigs, tick);
      upgradeMeasure(doc, el, sig, division, first ? openingKey : null);
      first = false;
      const [n, d] = sig?.actual ?? [4, 4];
      tick += (n * 4 * division) / d;
    }
  }

  const score = doc.createElement('Score');
  for (const el of childElements(root)) score.appendChild(el);
  root.appendChild(score);
  console.info(
    `dewidebug musescore1 upgraded version=${root.getAttribute('version') ?? '?'} staves=${String(childrenNamed(score, 'Staff').length)} sigs=${String(sigs.length)} tempos=${String(out.tempos.length)} voltas=${String(out.voltas.length)} clefChanges=${String(out.clefs.length)}`,
  );
  return out;
}
