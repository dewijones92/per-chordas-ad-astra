import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAsync } from '../src/ui/use-async.ts';

describe('useAsync', () => {
  it('loads, reloads and lets callers update the data', async () => {
    let n = 0;
    const { result } = renderHook(() => useAsync(() => Promise.resolve(++n), 'k'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.data).toBe(1);
    });
    expect(result.current.loading).toBe(false);
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.data).toBe(2);
    });
    act(() => {
      result.current.setData((d) => (d ?? 0) + 10);
    });
    expect(result.current.data).toBe(12);
  });

  it('reports errors and drops data that belongs to a different key', async () => {
    const { result, rerender } = renderHook(
      ({ key }) =>
        useAsync(
          () => (key === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve(key)),
          key,
        ),
      {
        initialProps: { key: 'a' },
      },
    );
    await waitFor(() => {
      expect(result.current.data).toBe('a');
    });
    rerender({ key: 'bad' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => {
      expect(result.current.error).toBe('nope');
    });
  });
});
