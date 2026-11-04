import { HeldKeys, type KeyHandler, type KeyInput } from './key-input.ts';

export type MidiStatus =
  | { state: 'off' }
  | { state: 'asking' }
  | { state: 'unsupported' }
  | { state: 'denied' }
  | { state: 'failed'; error: string }
  | { state: 'ready'; devices: string[] };

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;

export function parseMidiMessage(
  data: ArrayLike<number> | null | undefined,
): { kind: 'down' | 'up'; pitch: number; velocity: number } | null {
  if (!data || data.length < 3) return null;
  const status = (data[0] ?? 0) & 0xf0;
  const pitch = data[1] ?? 0;
  const velocity = data[2] ?? 0;
  if (status === NOTE_ON && velocity > 0) return { kind: 'down', pitch, velocity };
  if (status === NOTE_ON || status === NOTE_OFF) return { kind: 'up', pitch, velocity: 0 };
  return null;
}

export type RequestMidi = () => Promise<MIDIAccess>;

export function browserRequestMidi(): RequestMidi | null {
  return 'requestMIDIAccess' in navigator
    ? () => navigator.requestMIDIAccess({ sysex: false })
    : null;
}

export class MidiKeyInput implements KeyInput {
  private handler: KeyHandler | null = null;
  private access: MIDIAccess | null = null;
  private stopped = true;
  private deviceCount = 0;
  private readonly held = new HeldKeys('midi');

  constructor(
    private readonly onStatus: (status: MidiStatus) => void,
    private readonly request: () => RequestMidi | null = browserRequestMidi,
  ) {}

  start(handler: KeyHandler): void {
    this.handler = handler;
    this.stopped = false;
    const request = this.request();
    if (!request) {
      console.info('dewidebug midi unavailable: this browser has no requestMIDIAccess');
      this.onStatus({ state: 'unsupported' });
      return;
    }
    this.onStatus({ state: 'asking' });
    request().then(
      (access) => {
        if (this.stopped) {
          console.info('dewidebug midi access arrived after the input was stopped');
          return;
        }
        this.access = access;
        access.onstatechange = () => {
          this.attach(access);
        };
        this.attach(access);
      },
      (error: unknown) => {
        if (this.stopped) return;
        const name = error instanceof DOMException ? error.name : '';
        const denied = name === 'SecurityError' || name === 'NotAllowedError';
        console.warn('dewidebug midi access refused', { name, error: String(error) });
        this.onStatus(denied ? { state: 'denied' } : { state: 'failed', error: String(error) });
      },
    );
  }

  stop(): void {
    this.stopped = true;
    const access = this.access;
    this.access = null;
    if (access) {
      access.onstatechange = null;
      access.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    }
    if (this.handler) this.held.releaseAll(this.handler);
    this.handler = null;
    this.onStatus({ state: 'off' });
  }

  private attach(access: MIDIAccess): void {
    const devices: string[] = [];
    access.inputs.forEach((input) => {
      if (input.state === 'connected') {
        input.onmidimessage = (message) => {
          this.receive(message.data);
        };
        devices.push(input.name ?? input.id);
      } else {
        input.onmidimessage = null;
      }
    });
    console.info('dewidebug midi inputs', { devices });
    if (devices.length < this.deviceCount && this.handler) {
      console.info('dewidebug midi keyboard unplugged: letting go of its keys');
      this.held.releaseAll(this.handler);
    }
    this.deviceCount = devices.length;
    this.onStatus({ state: 'ready', devices });
  }

  private receive(data: Uint8Array | null): void {
    const handler = this.handler;
    const parsed = parseMidiMessage(data);
    if (!handler || !parsed) return;
    if (parsed.kind === 'down') this.held.down(parsed.pitch, parsed.velocity, handler);
    else this.held.up(parsed.pitch, handler);
  }
}
