import { describe, expect, it, vi } from 'vitest';
import type { KeyEvent } from '../src/music/key-input.ts';
import {
  MidiKeyInput,
  parseMidiControl,
  parseMidiMessage,
  type MidiStatus,
} from '../src/music/midi-input.ts';

class FakePort {
  state: 'connected' | 'disconnected' = 'connected';
  private listener: ((m: { data: Uint8Array }) => void) | null = null;

  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}

  get onmidimessage(): ((m: { data: Uint8Array }) => void) | null {
    return this.listener;
  }

  set onmidimessage(listener: ((m: { data: Uint8Array }) => void) | null) {
    this.listener = listener;
  }

  send(...bytes: number[]): boolean {
    if (!this.listener) return false;
    this.listener({ data: Uint8Array.from(bytes) });
    return true;
  }
}

class FakeAccess {
  readonly inputs = new Map<string, FakePort>();
  onstatechange: (() => void) | null = null;

  plug(port: FakePort): void {
    this.inputs.set(port.id, port);
    this.onstatechange?.();
  }

  unplug(id: string): void {
    const port = this.inputs.get(id);
    if (port) port.state = 'disconnected';
    this.onstatechange?.();
  }
}

const asAccess = (a: FakeAccess) => a as unknown as MIDIAccess;

function setup(access: Promise<MIDIAccess> | null) {
  const events: KeyEvent[] = [];
  const statuses: MidiStatus[] = [];
  const input = new MidiKeyInput(
    (s) => statuses.push(s),
    () => (access ? () => access : null),
  );
  input.start((e) => events.push(e));
  return { events, statuses, input };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MIDI messages', () => {
  it('reads note-on and note-off on any channel', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ kind: 'down', pitch: 60, velocity: 100 });
    expect(parseMidiMessage([0x93, 61, 1])).toEqual({ kind: 'down', pitch: 61, velocity: 1 });
    expect(parseMidiMessage([0x80, 60, 64])).toEqual({ kind: 'up', pitch: 60, velocity: 0 });
    expect(parseMidiMessage([0x8f, 72, 0])).toEqual({ kind: 'up', pitch: 72, velocity: 0 });
  });

  it('treats note-on with velocity 0 as note-off, as keyboards send it', () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ kind: 'up', pitch: 60, velocity: 0 });
  });

  it('ignores everything else: controllers, pitch bend, clock, truncated and empty messages', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull();
    expect(parseMidiMessage([0xe0, 0, 64])).toBeNull();
    expect(parseMidiMessage([0xf8])).toBeNull();
    expect(parseMidiMessage([0x90, 60])).toBeNull();
    expect(parseMidiMessage(null)).toBeNull();
  });
});

describe('the MIDI input', () => {
  it('listens to every connected keyboard and names them', async () => {
    const access = new FakeAccess();
    const a = new FakePort('a', 'Digital Piano');
    const b = new FakePort('b', null);
    access.inputs.set('a', a);
    access.inputs.set('b', b);
    const { events, statuses } = setup(Promise.resolve(asAccess(access)));
    expect(statuses).toEqual([{ state: 'asking' }]);
    await settle();
    expect(statuses.at(-1)).toEqual({ state: 'ready', devices: ['Digital Piano', 'b'] });
    a.send(0x90, 60, 90);
    b.send(0x90, 64, 70);
    a.send(0x80, 60, 0);
    expect(events.map((e) => [e.kind, e.pitch, e.velocity, e.source])).toEqual([
      ['down', 60, 90, 'midi'],
      ['down', 64, 70, 'midi'],
      ['up', 60, 0, 'midi'],
    ]);
  });

  it('picks up a keyboard plugged in later, and drops one that is unplugged', async () => {
    const access = new FakeAccess();
    const { events, statuses } = setup(Promise.resolve(asAccess(access)));
    await settle();
    expect(statuses.at(-1)).toEqual({ state: 'ready', devices: [] });
    const late = new FakePort('late', 'USB Keys');
    access.plug(late);
    expect(statuses.at(-1)).toEqual({ state: 'ready', devices: ['USB Keys'] });
    expect(late.send(0x90, 62, 80)).toBe(true);
    expect(events).toHaveLength(1);
    access.unplug('late');
    expect(statuses.at(-1)).toEqual({ state: 'ready', devices: [] });
    expect(late.send(0x90, 62, 80)).toBe(false);
    expect(events.map((e) => e.kind)).toEqual(['down', 'up']);
  });

  it('lets go of the keys a keyboard was holding when it is unplugged, so none stays stuck down', async () => {
    const access = new FakeAccess();
    const port = new FakePort('a', 'Piano');
    access.inputs.set('a', port);
    const { events } = setup(Promise.resolve(asAccess(access)));
    await settle();
    port.send(0x90, 60, 90);
    access.unplug('a');
    expect(events.map((e) => [e.kind, e.pitch])).toEqual([
      ['down', 60],
      ['up', 60],
    ]);
    const next = new FakePort('b', 'Other');
    access.plug(next);
    next.send(0x90, 60, 90);
    expect(events.filter((e) => e.kind === 'down')).toHaveLength(2);
  });

  it('says so when the browser has no MIDI', () => {
    const { statuses } = setup(null);
    expect(statuses).toEqual([{ state: 'unsupported' }]);
  });

  it('says so when permission is refused, however the browser words it', async () => {
    for (const name of ['SecurityError', 'NotAllowedError']) {
      const { statuses } = setup(Promise.reject(new DOMException('no', name)));
      await settle();
      expect(statuses.at(-1)).toEqual({ state: 'denied' });
    }
  });

  it('reports any other failure with its reason', async () => {
    const { statuses } = setup(Promise.reject(new Error('no backend')));
    await settle();
    expect(statuses.at(-1)).toEqual({ state: 'failed', error: 'Error: no backend' });
  });

  it('lets go of held keys and stops listening when stopped, even if access arrives late', async () => {
    const access = new FakeAccess();
    const port = new FakePort('a', 'Piano');
    access.inputs.set('a', port);
    const { events, input } = setup(Promise.resolve(asAccess(access)));
    await settle();
    port.send(0x90, 60, 90);
    input.stop();
    expect(events.map((e) => e.kind)).toEqual(['down', 'up']);
    expect(port.send(0x90, 62, 90)).toBe(false);

    const late = new FakeAccess();
    const latePort = new FakePort('b', 'Piano');
    late.inputs.set('b', latePort);
    const second = setup(Promise.resolve(asAccess(late)));
    second.input.stop();
    await settle();
    expect(latePort.send(0x90, 62, 90)).toBe(false);
    expect(second.statuses.at(-1)).toEqual({ state: 'off' });
  });

  it('counts a key held down once, however many keyboards press it', async () => {
    const access = new FakeAccess();
    const a = new FakePort('a', 'A');
    const b = new FakePort('b', 'B');
    access.inputs.set('a', a);
    access.inputs.set('b', b);
    const { events } = setup(Promise.resolve(asAccess(access)));
    await settle();
    a.send(0x90, 60, 90);
    b.send(0x90, 60, 90);
    expect(events).toHaveLength(1);
  });
});

it('reads damper values across channels and ignores incomplete or unrelated messages', () => {
  expect(parseMidiControl([0xbf, 64, 64])).toEqual({ kind: 'sustain', down: true });
  expect(parseMidiControl([0xb1, 64, 63])).toEqual({ kind: 'sustain', down: false });
  for (const bytes of [null, undefined, [0xb0, 64], [0xa0, 64, 127], [0xb0, 65, 127]])
    expect(parseMidiControl(bytes)).toBeNull();
});

it('lists all ports, releases keys and pedal on selection and releases the pedal on unplug and stop', async () => {
  const access = new FakeAccess();
  const a = new FakePort('a', 'Piano');
  const b = new FakePort('b', null);
  access.plug(a);
  access.plug(b);
  const onControl = vi.fn();
  const onPorts = vi.fn();
  const key = vi.fn();
  const input = new MidiKeyInput(vi.fn(), () => () => Promise.resolve(asAccess(access)), {
    onControl,
    onPorts,
  });
  input.start(key);
  await settle();
  expect(onPorts).toHaveBeenCalledWith([
    { id: 'a', name: 'Piano' },
    { id: 'b', name: 'b' },
  ]);
  a.send(0x90, 60, 90);
  a.send(0xb0, 64, 127);
  a.send(0xb0, 64, 100);
  expect(onControl).toHaveBeenCalledTimes(1);
  input.setDevice('b');
  expect(key.mock.lastCall?.[0]).toMatchObject({ kind: 'up', pitch: 60 });
  expect(onControl).toHaveBeenLastCalledWith({ kind: 'sustain', down: false });
  expect(a.send(0xb0, 64, 127)).toBe(false);
  b.send(0xb0, 64, 127);
  access.unplug('b');
  expect(onControl).toHaveBeenCalledTimes(4);
  expect(onPorts).toHaveBeenLastCalledWith([{ id: 'a', name: 'Piano' }]);
  input.setDevice(null);
  a.send(0xb0, 64, 127);
  input.stop();
  expect(onControl).toHaveBeenCalledTimes(6);
  expect(onControl).toHaveBeenLastCalledWith({ kind: 'sustain', down: false });
});
