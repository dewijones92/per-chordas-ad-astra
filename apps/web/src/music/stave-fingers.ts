import { noteKey, type ScoreModel, type ScoreNote } from './model.ts';
import { parseMusicXml } from './musicxml.ts';
import { toMusicXml } from './to-musicxml.ts';
import { child, childElements, childrenNamed, parseXml } from './xml.ts';

const FINGER_TAGS = ['fingering', 'pluck', 'string'] as const;
const AFTER_NOTATIONS: readonly string[] = ['lyric', 'play', 'listen'];

export function withUserFingers(score: ScoreModel, user: ReadonlyMap<string, string>): ScoreModel {
  const notation = score.notation;
  if (!notation || user.size === 0) return score;
  let placed = 0;
  const events = notation.events.map((e) => {
    if (e.rest || e.grace) return e;
    const notes = e.notes.map((n) => {
      const text = user.get(
        noteKey({ staff: e.staff, measure: e.measure, tick: e.tick, pitch: n.pitch }),
      );
      if (text === undefined) return n;
      placed += 1;
      return { ...n, finger: { text, kind: 'piano' as const } };
    });
    return notes.some((n, i) => n !== e.notes[i]) ? { ...e, notes } : e;
  });
  console.info('dewidebug stave fingers merged into the score model', {
    yours: user.size,
    placed,
  });
  return { ...score, notation: { ...notation, events } };
}

function writeFinger(note: Element, text: string): void {
  for (const notations of childrenNamed(note, 'notations')) {
    for (const technical of childrenNamed(notations, 'technical')) {
      for (const tag of FINGER_TAGS) for (const old of childrenNamed(technical, tag)) old.remove();
    }
  }
  const doc = note.ownerDocument;
  let notations = child(note, 'notations');
  if (!notations) {
    notations = doc.createElement('notations');
    const before = childElements(note).find((c) => AFTER_NOTATIONS.includes(c.tagName));
    note.insertBefore(notations, before ?? null);
  }
  let technical = child(notations, 'technical');
  if (!technical) {
    technical = doc.createElement('technical');
    notations.append(technical);
  }
  const fingering = doc.createElement('fingering');
  fingering.textContent = text;
  technical.append(fingering);
}

export function fingeredMusicXml(source: string, user: ReadonlyMap<string, string>): string {
  if (user.size === 0) return source;
  try {
    const doc = parseXml(source);
    const sources = new Map<ScoreNote, Element>();
    parseMusicXml(doc, sources);
    let placed = 0;
    for (const [note, el] of sources) {
      if (note.grace) continue;
      const text = user.get(noteKey(note));
      if (text === undefined) continue;
      writeFinger(el, text);
      placed += 1;
    }
    console.info('dewidebug stave fingers written into the MusicXML', {
      yours: user.size,
      placed,
    });
    return new XMLSerializer().serializeToString(doc);
  } catch (error) {
    console.warn('dewidebug stave fingers not written; the stave shows the file as it is', {
      error: String(error),
    });
    return source;
  }
}

export const NO_FINGERS: ReadonlyMap<string, string> = new Map();

export function staveSourceXml(
  score: ScoreModel,
  text: string | null,
  user: ReadonlyMap<string, string>,
): string | null {
  if (score.format === 'musicxml') return text === null ? null : fingeredMusicXml(text, user);
  const fingered = withUserFingers(score, user);
  return fingered.notation ? toMusicXml(fingered, fingered.notation) : null;
}
