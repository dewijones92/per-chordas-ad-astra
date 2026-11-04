import { useState, type ReactNode } from 'react';
import { tips } from '../strings.ts';

export function useHelp(
  title: string,
  testId: string,
  lines: readonly string[] | undefined,
): { button: ReactNode; text: ReactNode } {
  const [open, setOpen] = useState(false);
  if (!lines) return { button: null, text: null };
  return {
    button: (
      <button
        type="button"
        className="btn small ghost icon"
        aria-label={tips.common.help(title)}
        aria-expanded={open}
        data-testid={`${testId}-help`}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        ❓
      </button>
    ),
    text: open ? (
      <div className="choice-help" data-testid={`${testId}-help-text`}>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    ) : null,
  };
}
