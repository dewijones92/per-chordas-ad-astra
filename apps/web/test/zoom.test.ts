import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, stepZoom, wheelZoom, zoomKeyOf } from '../src/score/zoom.ts';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('zoomKeyOf', () => {
  it('reads Ctrl and Cmd plus, minus and zero as score zoom', () => {
    expect(zoomKeyOf(key('=', { ctrlKey: true }))).toBe('in');
    expect(zoomKeyOf(key('+', { ctrlKey: true }))).toBe('in');
    expect(zoomKeyOf(key('-', { ctrlKey: true }))).toBe('out');
    expect(zoomKeyOf(key('_', { ctrlKey: true }))).toBe('out');
    expect(zoomKeyOf(key('0', { ctrlKey: true }))).toBe('reset');
    expect(zoomKeyOf(key('=', { metaKey: true }))).toBe('in');
  });

  it('leaves plain keys to the metronome and other modifiers alone', () => {
    expect(zoomKeyOf(key('='))).toBeNull();
    expect(zoomKeyOf(key('-'))).toBeNull();
    expect(zoomKeyOf(key('=', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(zoomKeyOf(key('z', { ctrlKey: true }))).toBeNull();
  });
});

describe('stepZoom', () => {
  it('moves in tenths and lands on round numbers', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(1.23, 1)).toBe(1.3);
    let z = 1;
    for (let i = 0; i < 7; i++) z = stepZoom(z, 1);
    expect(z).toBe(1.7);
  });

  it('stays within the limits', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe('wheelZoom', () => {
  it('zooms in on scroll up and out on scroll down, by about 10% per mouse notch', () => {
    expect(wheelZoom(1, -100, 0)).toBeCloseTo(1.105, 3);
    expect(wheelZoom(1, 100, 0)).toBeCloseTo(0.905, 3);
  });

  it('follows a trackpad pinch finely', () => {
    const z = wheelZoom(1, -3, 0);
    expect(z).toBeGreaterThan(1);
    expect(z).toBeLessThan(1.01);
  });

  it('treats line-mode deltas like pixels', () => {
    expect(wheelZoom(1, -3, 1)).toBeCloseTo(wheelZoom(1, -48, 0), 6);
  });

  it('stays within the limits', () => {
    expect(wheelZoom(MAX_ZOOM, -100, 0)).toBe(MAX_ZOOM);
    expect(wheelZoom(MIN_ZOOM, 100, 0)).toBe(MIN_ZOOM);
  });
});
