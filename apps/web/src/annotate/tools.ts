import type { STAMP_GLYPHS } from '@pcaa/shared';

export type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'text'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'stamp';

export type SizeName = 'S' | 'M' | 'L';
export type Glyph = (typeof STAMP_GLYPHS)[number];

export interface ToolState {
  tool: Tool;
  colour: string;
  highlightColour: string;
  size: SizeName;
  glyph: Glyph;
}

export const COLOURS = ['#1d1533', '#e0213f', '#6d3df2', '#0f8f80', '#2f6fe0', '#e8780c'] as const;
export const HIGHLIGHTS = ['#ffd400', '#7cf0a0', '#ff8fb0', '#8fd3ff'] as const;

export const SIZES: Record<
  'pen' | 'highlighter' | 'shape' | 'text' | 'stamp',
  Record<SizeName, number>
> = {
  pen: { S: 1.6, M: 3, L: 5.5 },
  highlighter: { S: 9, M: 15, L: 24 },
  shape: { S: 1.5, M: 2.5, L: 4 },
  text: { S: 12, M: 16, L: 24 },
  stamp: { S: 15, M: 21, L: 30 },
};

export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  t: 'text',
  l: 'line',
  a: 'arrow',
  r: 'rect',
  o: 'ellipse',
  s: 'stamp',
};

export const TOOL_LABELS: Record<Tool, { icon: string; label: string; key: string }> = {
  select: { icon: '↖', label: 'Select & move', key: 'V' },
  pen: { icon: '✎', label: 'Pen', key: 'P' },
  highlighter: { icon: '▍', label: 'Highlighter', key: 'H' },
  eraser: { icon: '⌫', label: 'Eraser', key: 'E' },
  text: { icon: 'T', label: 'Text', key: 'T' },
  line: { icon: '╱', label: 'Line', key: 'L' },
  arrow: { icon: '➚', label: 'Arrow', key: 'A' },
  rect: { icon: '▭', label: 'Box', key: 'R' },
  ellipse: { icon: '◯', label: 'Circle', key: 'O' },
  stamp: { icon: '★', label: 'Stamp', key: 'S' },
};

export const STAMP_LABELS: Record<Glyph, string> = {
  '1': 'Finger 1',
  '2': 'Finger 2',
  '3': 'Finger 3',
  '4': 'Finger 4',
  T: 'Thumb',
  '↑': 'Up-strum',
  '↓': 'Down-strum',
  P: 'Pull-off',
  H: 'Hammer-on',
  S: 'Slide',
  '𝄆': 'Repeat start',
  '𝄇': 'Repeat end',
  '✓': 'Got it',
  '!': 'Watch out',
};

export const defaultToolState = (): ToolState => ({
  tool: 'pen',
  colour: COLOURS[1],
  highlightColour: HIGHLIGHTS[0],
  size: 'M',
  glyph: '1',
});

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
