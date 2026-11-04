import { describe, expect, it, vi } from 'vitest';
import { ComputerKeyInput } from '../src/music/computer-key-input.ts';
import {
  computerKeyPitch,
  DEFAULT_BASE,
  HIGHEST_BASE,
  LOWEST_BASE,
  octaveShiftOf,
  shiftBase,
} from '../src/music/computer-keys.ts';
import type { KeyEvent } from '../src/music/key-input.ts';
import { shortcutOf } from '../src/ui/shortcuts.ts';

const ROW = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH'];

describe('the computer keyboard as a piano', () => {
  it('plays C to B from A W S E D F T G Y H U J, white keys on the home row', () => {
    const codes = [...ROW, 'KeyU', 'KeyJ'];
    expect(codes.map((c) => computerKeyPitch(c, 60))).toEqual([
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
    ]);
    expect(computerKeyPitch('KeyA', 48)).toBe(48);
  });

  it('leaves K and M alone, because they play and pause and run the metronome', () => {
    expect(computerKeyPitch('KeyK', 60)).toBeNull();
    expect(computerKeyPitch('KeyM', 60)).toBeNull();
  });

  it('never uses a key the shortcut table owns', () => {
    for (const code of [...ROW, 'KeyU', 'KeyJ', 'KeyZ', 'KeyX']) {
      const letter = code.slice(3).toLowerCase();
      expect(shortcutOf(new KeyboardEvent('keydown', { key: letter, code }))).toBeNull();
    }
  });

  it('moves an octave with Z and X, and stops at the ends', () => {
    expect(octaveShiftOf('KeyZ')).toBe(-1);
    expect(octaveShiftOf('KeyX')).toBe(1);
    expect(octaveShiftOf('KeyA')).toBeNull();
    expect(shiftBase(DEFAULT_BASE, 1)).toBe(72);
    expect(shiftBase(DEFAULT_BASE, -1)).toBe(48);
    expect(shiftBase(LOWEST_BASE, -1)).toBe(LOWEST_BASE);
    expect(shiftBase(HIGHEST_BASE, 1)).toBe(HIGHEST_BASE);
  });
});

describe('the computer keyboard input', () => {
  function setup() {
    const events: KeyEvent[] = [];
    const bases: number[] = [];
    const input = new ComputerKeyInput((b) => bases.push(b));
    input.start((e) => events.push(e));
    const fire = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent(type, {
        code,
        key: code.slice(3).toLowerCase(),
        bubbles: true,
        cancelable: true,
        ...init,
      });
      document.body.dispatchEvent(e);
      return e;
    };
    return { events, bases, input, fire };
  }

  it('sounds a key on press and lets it go on release, and claims the key from other handlers', () => {
    const { events, input, fire } = setup();
    const windowSaw = vi.fn();
    window.addEventListener('keydown', windowSaw);
    const down = fire('keydown', 'KeyA');
    fire('keyup', 'KeyA');
    window.removeEventListener('keydown', windowSaw);
    expect(events.map((e) => [e.kind, e.pitch, e.source])).toEqual([
      ['down', 60, 'computer'],
      ['up', 60, 'computer'],
    ]);
    expect(down.defaultPrevented).toBe(true);
    expect(windowSaw).not.toHaveBeenCalled();
    input.stop();
  });

  it('lets the keys it does not own reach everyone else', () => {
    const { events, input, fire } = setup();
    const windowSaw = vi.fn();
    window.addEventListener('keydown', windowSaw);
    const k = fire('keydown', 'KeyK');
    const space = fire('keydown', 'Space', { key: ' ' });
    window.removeEventListener('keydown', windowSaw);
    expect(events).toEqual([]);
    expect(k.defaultPrevented).toBe(false);
    expect(space.defaultPrevented).toBe(false);
    expect(windowSaw).toHaveBeenCalledTimes(2);
    input.stop();
  });

  it('ignores key repeat, modified keys and typing in a text box', () => {
    const { events, input, fire } = setup();
    fire('keydown', 'KeyD');
    fire('keydown', 'KeyD', { repeat: true });
    fire('keydown', 'KeyF', { ctrlKey: true });
    const box = document.createElement('input');
    box.type = 'text';
    document.body.append(box);
    box.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyG', key: 'g', bubbles: true, cancelable: true }),
    );
    box.remove();
    expect(events.map((e) => e.pitch)).toEqual([64]);
    input.stop();
  });

  it('shifts the octave, releases a held key at its old pitch, and tells the screen', () => {
    const { events, bases, input, fire } = setup();
    fire('keydown', 'KeyA');
    fire('keydown', 'KeyX');
    fire('keyup', 'KeyA');
    fire('keydown', 'KeyA');
    expect(bases).toEqual([60, 72]);
    expect(events.map((e) => [e.kind, e.pitch])).toEqual([
      ['down', 60],
      ['up', 60],
      ['down', 72],
    ]);
    input.stop();
  });

  it('lets go of everything held when the window loses focus or the input stops', () => {
    const { events, input, fire } = setup();
    fire('keydown', 'KeyA');
    fire('keydown', 'KeyD');
    window.dispatchEvent(new Event('blur'));
    expect(events.filter((e) => e.kind === 'up').map((e) => e.pitch)).toEqual([60, 64]);
    fire('keydown', 'KeyG');
    input.stop();
    expect(events.at(-1)).toMatchObject({ kind: 'up', pitch: 67 });
    fire('keydown', 'KeyA');
    expect(events.filter((e) => e.kind === 'down')).toHaveLength(3);
  });
});
