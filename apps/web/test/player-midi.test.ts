import { afterEach, expect, it, vi } from 'vitest';
import { PianoPlayer } from '../src/music/player.ts';

function setup() {
  const stops: ReturnType<typeof vi.fn>[] = [];
  const oscillator = vi.fn(() => {
    const stop = vi.fn();
    stops.push(stop);
    return { connect: vi.fn(), frequency: { value: 0 }, start: vi.fn(), stop };
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = 1;
      state = 'running';
      createOscillator = oscillator;
      createGain = () => ({
        connect: vi.fn(),
        gain: {
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
        },
      });
      close = vi.fn();
    },
  );
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no samples')));
  const player = new PianoPlayer(
    {
      title: '',
      notes: [{ pitch: 48, start: 0, end: 1, velocity: 80, staff: 0, bar: 0, grace: false }],
      bars: [],
      clicks: [],
      staves: [],
      duration: 3,
      lowest: 60,
      highest: 64,
      keyFifths: 0,
      keyMinor: false,
      baseBpm: null,
      warnings: [],
    },
    vi.fn(),
  );
  return { player, stops, oscillator };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('defers release until pedal up and releases the previous voice on a re-strike', async () => {
  const { player, stops } = setup();
  player.keyDown(60, 80);
  await vi.waitFor(() => {
    expect(stops).toHaveLength(1);
  });
  player.setSustain(true);
  player.keyUp(60);
  expect(stops[0]).not.toHaveBeenCalled();
  player.keyDown(60, 100);
  await vi.waitFor(() => {
    expect(stops).toHaveLength(2);
  });
  expect(stops[0]).toHaveBeenCalledOnce();
  player.setSustain(false);
  expect(stops[1]).not.toHaveBeenCalled();
  player.setSustain(true);
  player.keyUp(60);
  player.setSustain(false);
  expect(stops[1]).toHaveBeenCalledOnce();
  player.dispose();
});

it('mutes held and pedalled voices immediately and only sounds new keys after unmuting', async () => {
  const { player, stops, oscillator } = setup();
  player.setLiveSound(false);
  player.keyDown(72, 90);
  expect(fetch).not.toHaveBeenCalled();
  player.setLiveSound(true);
  player.keyDown(60, 90);
  player.keyDown(64, 90);
  await vi.waitFor(() => {
    expect(oscillator).toHaveBeenCalledTimes(2);
  });
  player.setSustain(true);
  player.keyUp(60);
  player.setLiveSound(false);
  for (const stop of stops) expect(stop).toHaveBeenCalledWith(1);
  player.keyDown(61, 90);
  player.setLiveSound(true);
  expect(oscillator).toHaveBeenCalledTimes(2);
  player.keyDown(63, 90);
  await vi.waitFor(() => {
    expect(oscillator).toHaveBeenCalledTimes(3);
  });
  player.keyUp(63);
  player.dispose();
  expect(stops[2]).toHaveBeenCalledWith(1);
});

it('plays accompaniment while muted and cancels a live attack still loading at mute time', async () => {
  const { player, stops } = setup();
  player.keyDown(60, 80);
  player.setLiveSound(false);
  await player.play();
  try {
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveBeenCalledOnce();
    player.setLiveSound(true);
    player.setLiveSound(false);
    expect(stops[0]).toHaveBeenCalledOnce();
  } finally {
    player.dispose();
  }
});
