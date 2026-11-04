import { ownsKey } from '../ui/shortcuts.ts';
import { computerKeyPitch, DEFAULT_BASE, octaveShiftOf, shiftBase } from './computer-keys.ts';
import { DEFAULT_VELOCITY, HeldKeys, type KeyHandler, type KeyInput } from './key-input.ts';

export class ComputerKeyInput implements KeyInput {
  private handler: KeyHandler | null = null;
  private base = DEFAULT_BASE;
  private readonly held = new HeldKeys('computer');
  private readonly byCode = new Map<string, number>();

  constructor(private readonly onBase: (base: number) => void) {}

  start(handler: KeyHandler): void {
    this.handler = handler;
    this.onBase(this.base);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  stop(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.onBlur();
    this.handler = null;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const handler = this.handler;
    if (!handler || e.ctrlKey || e.metaKey || e.altKey || ownsKey(e.target, e.key)) return;
    const shift = octaveShiftOf(e.code);
    const pitch = computerKeyPitch(e.code, this.base);
    if (shift === null && pitch === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (shift !== null) {
      this.base = shiftBase(this.base, shift);
      console.info('dewidebug computer keys octave', { base: this.base });
      this.onBase(this.base);
      return;
    }
    if (pitch === null) return;
    this.byCode.set(e.code, pitch);
    this.held.down(pitch, DEFAULT_VELOCITY, handler);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const pitch = this.byCode.get(e.code);
    if (pitch === undefined || !this.handler) return;
    this.byCode.delete(e.code);
    this.held.up(pitch, this.handler);
  };

  private readonly onBlur = (): void => {
    this.byCode.clear();
    if (this.handler) this.held.releaseAll(this.handler);
  };
}
