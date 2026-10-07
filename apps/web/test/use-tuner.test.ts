import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTuner } from '../src/tuner/use-tuner.ts';

describe('useTuner start guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks for the microphone once on a double click, and releases it if stopped before it opens', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const trackStop = vi.fn();
    let resolve: (s: unknown) => void = () => undefined;
    const getUserMedia = vi.fn(() => new Promise((r) => (resolve = r)));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const { result, unmount } = renderHook(() => useTuner());
    act(() => {
      result.current.start();
      result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      resolve({ getTracks: () => [{ stop: trackStop }] });
      await Promise.resolve();
    });
    expect(trackStop).toHaveBeenCalledTimes(1);
  });
});
