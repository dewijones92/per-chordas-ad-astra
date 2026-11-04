export type KeySource = 'midi' | 'screen' | 'computer';

export interface KeyEvent {
  kind: 'down' | 'up';
  pitch: number;
  velocity: number;
  source: KeySource;
  at: number;
}

export type KeyHandler = (event: KeyEvent) => void;

export interface KeyInput {
  start(handler: KeyHandler): void;
  stop(): void;
}

export const DEFAULT_VELOCITY = 80;

export class HeldKeys {
  private readonly held = new Set<number>();

  constructor(
    private readonly source: KeySource,
    private readonly now: () => number = () => performance.now(),
  ) {}

  down(pitch: number, velocity: number, emit: KeyHandler): void {
    if (this.held.has(pitch)) return;
    this.held.add(pitch);
    emit({ kind: 'down', pitch, velocity, source: this.source, at: this.now() });
  }

  up(pitch: number, emit: KeyHandler): void {
    if (!this.held.delete(pitch)) return;
    emit({ kind: 'up', pitch, velocity: 0, source: this.source, at: this.now() });
  }

  releaseAll(emit: KeyHandler): void {
    for (const pitch of [...this.held]) this.up(pitch, emit);
  }
}

export class ScreenKeyInput implements KeyInput {
  private handler: KeyHandler | null = null;
  private readonly held = new HeldKeys('screen');

  start(handler: KeyHandler): void {
    this.handler = handler;
  }

  stop(): void {
    if (this.handler) this.held.releaseAll(this.handler);
    this.handler = null;
  }

  press(pitch: number): void {
    if (this.handler) this.held.down(pitch, DEFAULT_VELOCITY, this.handler);
    else console.info('dewidebug screen key ignored: input is off', { pitch });
  }

  release(pitch: number): void {
    if (this.handler) this.held.up(pitch, this.handler);
  }
}
