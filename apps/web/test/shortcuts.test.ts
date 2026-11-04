import { describe, expect, it } from 'vitest';
import { ownsKey, shortcutOf } from '../src/ui/shortcuts.ts';

function press(key: string, target: EventTarget | null, mods: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, ...mods });
  Object.defineProperty(e, 'target', { value: target });
  return e;
}

function input(type: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  return el;
}

describe('which keys a focused control keeps', () => {
  it('lets Space through a tick box, a button, a slider and a select', () => {
    for (const el of [
      input('checkbox'),
      input('radio'),
      document.createElement('button'),
      input('range'),
      document.createElement('select'),
    ]) {
      expect(ownsKey(el, ' ')).toBe(false);
      expect(shortcutOf(press(' ', el))).toBe('playPause');
    }
  });

  it('keeps every key in a text box, a number box and a text area', () => {
    for (const el of [
      input('text'),
      input('number'),
      input('search'),
      document.createElement('textarea'),
    ]) {
      for (const key of [' ', 'k', 'm', 'ArrowLeft', '['])
        expect(shortcutOf(press(key, el))).toBeNull();
    }
  });

  it('keeps the arrows on a slider and the letters on a select, where they already do something', () => {
    expect(shortcutOf(press('ArrowRight', input('range')))).toBeNull();
    expect(shortcutOf(press('PageDown', input('range')))).toBeNull();
    expect(shortcutOf(press('m', document.createElement('select')))).toBeNull();
    expect(shortcutOf(press('ArrowRight', input('checkbox')))).toBe('nextPage');
  });
});

describe('the shortcut table', () => {
  it('maps each key to one action', () => {
    const body = document.body;
    expect(shortcutOf(press(' ', body))).toBe('playPause');
    expect(shortcutOf(press('k', body))).toBe('playPause');
    expect(shortcutOf(press('K', body))).toBe('playPause');
    expect(shortcutOf(press('m', body))).toBe('metronome');
    expect(shortcutOf(press('[', body))).toBe('slower');
    expect(shortcutOf(press(']', body))).toBe('faster');
    expect(shortcutOf(press(',', body))).toBe('previousBar');
    expect(shortcutOf(press('.', body))).toBe('nextBar');
    expect(shortcutOf(press('ArrowLeft', body))).toBe('previousPage');
    expect(shortcutOf(press('PageUp', body))).toBe('previousPage');
    expect(shortcutOf(press('ArrowRight', body))).toBe('nextPage');
    expect(shortcutOf(press('+', body))).toBe('tempoUp');
    expect(shortcutOf(press('=', body))).toBe('tempoUp');
    expect(shortcutOf(press('-', body))).toBe('tempoDown');
    expect(shortcutOf(press('x', body))).toBeNull();
  });

  it('leaves Ctrl, Cmd and Alt combinations to the browser', () => {
    expect(shortcutOf(press(' ', document.body, { ctrlKey: true }))).toBeNull();
    expect(shortcutOf(press('m', document.body, { metaKey: true }))).toBeNull();
    expect(shortcutOf(press('k', document.body, { altKey: true }))).toBeNull();
  });
});
