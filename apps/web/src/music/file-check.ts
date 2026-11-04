import type { FingerKind, ScoreModel } from './model.ts';

export type Declared = 'piano' | 'guitar' | 'other' | 'unknown';
export type Layout = 'grand' | 'tab' | 'single';
export type Verdict = 'piano' | 'guitar' | 'unclear';

export interface FileCheck {
  declared: Declared;
  layout: Layout;
  fingers: Record<FingerKind, number>;
  verdict: Verdict;
}

const GUITAR = /guitar|gtr|pluck\.|\blute\b|ukulele|banjo/i;
const KEYBOARD = /piano|keyboard|harpsichord|clavi|organ|celesta/i;
const RIGHT_HAND = /^(p|i|m|a|c|e|x|ch)$/i;

export function isGuitarName(name: string): boolean {
  return GUITAR.test(name);
}

export function fingerKind(text: string, style: string, guitarPart: boolean): FingerKind | null {
  const t = text.trim();
  const s = style.toLowerCase().replace(/[^a-z]/g, '');
  if (t === '') return null;
  if (s.includes('string')) return /^\d$/.test(t) ? 'string' : null;
  if (s.includes('rh') || s.includes('pluck')) return 'guitarRight';
  if (RIGHT_HAND.test(t)) return 'guitarRight';
  if (!/^[0-5]$/.test(t)) return null;
  if (s.includes('lh') || s.includes('guitar') || guitarPart || t === '0') return 'guitarLeft';
  return 'piano';
}

function declaredOf(score: ScoreModel): Declared {
  const named = score.parts.map((p) => (p.instrument ?? '') || p.name);
  const clues = score.parts.map((p) => p.instrument ?? '').filter((id) => id !== '');
  const pool = clues.length > 0 ? clues : named;
  if (pool.some((x) => GUITAR.test(x))) return 'guitar';
  if (pool.some((x) => KEYBOARD.test(x))) return 'piano';
  return clues.length > 0 ? 'other' : 'unknown';
}

function layoutOf(score: ScoreModel): Layout {
  if (score.parts.some((p) => p.tab)) return 'tab';
  if (score.parts.some((p) => p.staves.length === 2)) return 'grand';
  return 'single';
}

export function checkFile(score: ScoreModel): FileCheck {
  const fingers: Record<FingerKind, number> = {
    piano: 0,
    guitarLeft: 0,
    guitarRight: 0,
    string: 0,
  };
  for (const n of score.notes) if (n.finger) fingers[n.finger.kind] += 1;
  const declared = declaredOf(score);
  const layout = layoutOf(score);
  const guitarFingers = fingers.guitarLeft + fingers.guitarRight + fingers.string;
  const verdict: Verdict =
    declared === 'guitar' || layout === 'tab' || guitarFingers > fingers.piano
      ? 'guitar'
      : declared === 'piano' && layout === 'grand'
        ? 'piano'
        : 'unclear';
  const check = { declared, layout, fingers, verdict };
  console.info('dewidebug file check', {
    ...check,
    parts: score.parts.map((p) => ({
      name: p.name,
      instrument: p.instrument ?? '',
      staves: p.staves.length,
      tab: p.tab ?? false,
    })),
  });
  return check;
}
