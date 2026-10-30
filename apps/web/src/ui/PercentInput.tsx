import { speedPercent } from '@pcaa/shared';
import { useState } from 'react';
import { units } from '../strings.ts';

export function PercentInput({
  value,
  min,
  max,
  step,
  label,
  testId,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  testId: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const apply = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    console.info('dewidebug percent input', { testId, typed: next, applied: clamped });
    onChange(clamped);
  };
  const commit = () => {
    if (text === null) return;
    setText(null);
    const typed = Number(text);
    if (text.trim() === '' || !Number.isFinite(typed)) {
      console.info('dewidebug percent input ignored', { testId, text });
      return;
    }
    apply(typed / 100);
  };
  return (
    <span className="percent-input">
      <input
        className="input mini"
        type="number"
        min={min * 100}
        max={max * 100}
        step={step * 100}
        value={text ?? String(speedPercent(value))}
        aria-label={label}
        data-testid={testId}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setText(null);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setText(null);
            apply(value + (e.key === 'ArrowUp' ? step : -step));
          }
        }}
      />
      {units.percent}
    </span>
  );
}
