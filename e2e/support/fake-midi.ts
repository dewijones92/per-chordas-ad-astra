import type { Page } from '@playwright/test';

export type FakeMidiMode = 'allowed' | 'denied' | 'unsupported';

export interface FakeMidiOptions {
  mode: FakeMidiMode;
  devices?: { id: string; name: string }[];
}

export async function installFakeMidi(page: Page, options: FakeMidiOptions): Promise<void> {
  await page.addInitScript((opts) => {
    interface Port {
      id: string;
      name: string;
      state: 'connected' | 'disconnected';
      connection: 'open' | 'closed';
      type: 'input';
      _listener: ((event: { data: Uint8Array }) => void) | null;
      onmidimessage: ((event: { data: Uint8Array }) => void) | null;
    }
    const inputs = new Map<string, Port>();
    const access = {
      inputs,
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null as (() => void) | null,
    };
    const makePort = (id: string, name: string): Port => {
      const port: Port = {
        id,
        name,
        state: 'connected',
        connection: 'closed',
        type: 'input',
        _listener: null,
        get onmidimessage() {
          return this._listener;
        },
        set onmidimessage(listener) {
          this._listener = listener;
          this.connection = listener ? 'open' : 'closed';
        },
      };
      return port;
    };
    for (const d of opts.devices ?? []) inputs.set(d.id, makePort(d.id, d.name));
    const state = { requests: 0, delivered: 0, dropped: 0 };
    const midi = {
      state,
      plug(id: string, name: string) {
        inputs.set(id, makePort(id, name));
        access.onstatechange?.();
      },
      unplug(id: string) {
        const port = inputs.get(id);
        if (port) port.state = 'disconnected';
        access.onstatechange?.();
      },
      send(id: string, bytes: number[]) {
        const port = inputs.get(id);
        if (port?.state !== 'connected' || !port._listener) {
          state.dropped += 1;
          return false;
        }
        state.delivered += 1;
        port._listener({ data: Uint8Array.from(bytes) });
        return true;
      },
      noteOn(id: string, pitch: number, velocity = 90) {
        return midi.send(id, [0x90, pitch, velocity]);
      },
      noteOff(id: string, pitch: number) {
        return midi.send(id, [0x80, pitch, 0]);
      },
    };
    (window as unknown as { __midi: typeof midi }).__midi = midi;
    if (opts.mode === 'unsupported') {
      Reflect.deleteProperty(Navigator.prototype, 'requestMIDIAccess');
      return;
    }
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: () => {
        state.requests += 1;
        if (opts.mode === 'denied')
          return Promise.reject(new DOMException('MIDI permission denied', 'NotAllowedError'));
        return Promise.resolve(access);
      },
    });
  }, options);
}

export interface FakeMidiPage {
  plug: (id: string, name: string) => Promise<void>;
  unplug: (id: string) => Promise<void>;
  noteOn: (id: string, pitch: number) => Promise<boolean>;
  noteOff: (id: string, pitch: number) => Promise<boolean>;
  requests: () => Promise<number>;
}

interface Win {
  __midi: {
    plug(id: string, name: string): void;
    unplug(id: string): void;
    noteOn(id: string, pitch: number): boolean;
    noteOff(id: string, pitch: number): boolean;
    state: { requests: number };
  };
}

export function fakeMidi(page: Page): FakeMidiPage {
  return {
    plug: (id, name) =>
      page.evaluate(
        ([i, n]) => {
          (window as unknown as Win).__midi.plug(i, n);
        },
        [id, name] as const,
      ),
    unplug: (id) =>
      page.evaluate((i) => {
        (window as unknown as Win).__midi.unplug(i);
      }, id),
    noteOn: (id, pitch) =>
      page.evaluate(([i, p]) => (window as unknown as Win).__midi.noteOn(i, p), [
        id,
        pitch,
      ] as const),
    noteOff: (id, pitch) =>
      page.evaluate(([i, p]) => (window as unknown as Win).__midi.noteOff(i, p), [
        id,
        pitch,
      ] as const),
    requests: () => page.evaluate(() => (window as unknown as Win).__midi.state.requests),
  };
}
