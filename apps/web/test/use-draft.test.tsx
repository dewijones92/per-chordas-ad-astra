import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDraft } from '../src/ui/use-draft.ts';

function Field({ save }: { save: (v: string, keepalive: boolean) => void }) {
  const [value, setValue] = useDraft<string>('start', save, 500);
  return (
    <input
      aria-label="field"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
      }}
    />
  );
}

describe('useDraft', () => {
  it('saves after a pause, once', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const { getByLabelText } = render(<Field save={save} />);
    const input = getByLabelText('field') as HTMLInputElement;
    act(() => {
      input.value = '';
    });
    act(() => {
      setValue(input, 'ab');
      setValue(input, 'abc');
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledExactlyOnceWith('abc', false);
    vi.useRealTimers();
  });

  it('flushes an unsaved edit with keepalive when the field goes away', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const { getByLabelText, unmount } = render(<Field save={save} />);
    act(() => {
      setValue(getByLabelText('field') as HTMLInputElement, 'typed then left');
    });
    unmount();
    expect(save).toHaveBeenCalledExactlyOnceWith('typed then left', true);
    vi.useRealTimers();
  });

  it('does not save when nothing was edited', () => {
    const save = vi.fn();
    const { unmount } = render(<Field save={save} />);
    unmount();
    expect(save).not.toHaveBeenCalled();
  });
});

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
