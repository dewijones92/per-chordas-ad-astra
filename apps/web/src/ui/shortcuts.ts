import { strings } from '../strings.ts';

export type Shortcut =
  | 'playPause'
  | 'metronome'
  | 'slower'
  | 'faster'
  | 'previousBar'
  | 'nextBar'
  | 'previousPage'
  | 'nextPage'
  | 'tempoUp'
  | 'tempoDown';

const BINDINGS: Readonly<Record<string, Shortcut>> = {
  ' ': 'playPause',
  k: 'playPause',
  m: 'metronome',
  '[': 'slower',
  ']': 'faster',
  ',': 'previousBar',
  '.': 'nextBar',
  ArrowLeft: 'previousPage',
  PageUp: 'previousPage',
  ArrowRight: 'nextPage',
  PageDown: 'nextPage',
  '+': 'tempoUp',
  '=': 'tempoUp',
  '-': 'tempoDown',
};

const PRESS_ONLY_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'color',
  'file',
]);
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const SLIDER_KEYS = new Set([...ARROWS, 'PageUp', 'PageDown', 'Home', 'End']);

export function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return key !== ' ';
  if (target instanceof HTMLInputElement) {
    if (target.type === 'range') return SLIDER_KEYS.has(key);
    if (target.type === 'radio') return ARROWS.has(key);
    return !PRESS_ONLY_INPUTS.has(target.type);
  }
  return false;
}

export function shortcutOf(e: KeyboardEvent): Shortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || ownsKey(e.target, e.key)) return null;
  return BINDINGS[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? null;
}

export const KEYS_HELP: readonly string[] = [
  strings.keys.playPause,
  strings.keys.metronome,
  strings.keys.speed,
  strings.keys.bars,
  strings.keys.pages,
  strings.keys.tempo,
  strings.keys.zoom,
  strings.keys.tools,
  strings.keys.undo,
];
