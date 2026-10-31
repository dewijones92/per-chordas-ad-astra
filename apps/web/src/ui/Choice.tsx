import { useState } from 'react';
import { tips } from '../strings.ts';

export function Choice<T extends string>({
  label,
  title,
  value,
  options,
  testId,
  help,
  note,
  onChange,
}: {
  label: string;
  title: string;
  value: T;
  options: readonly { value: T; label: string; tip?: string }[];
  testId: string;
  help?: readonly string[];
  note?: string | null;
  onChange: (value: T) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <span className="playalong-field" role="group" aria-label={title} data-testid={testId}>
        <span title={title}>{label}</span>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="btn small"
            aria-pressed={value === o.value}
            data-choice={o.value}
            title={o.tip}
            onClick={() => {
              if (value !== o.value)
                console.info('dewidebug choice', { testId, from: value, to: o.value });
              onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
        {note && (
          <span className="muted small-print" data-testid={`${testId}-note`}>
            {note}
          </span>
        )}
        {help && (
          <button
            type="button"
            className="btn small ghost icon"
            aria-label={tips.common.help(title)}
            aria-expanded={helpOpen}
            data-testid={`${testId}-help`}
            onClick={() => {
              setHelpOpen((open) => !open);
            }}
          >
            ❓
          </button>
        )}
      </span>
      {help && helpOpen && (
        <div className="choice-help" data-testid={`${testId}-help-text`}>
          {help.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </>
  );
}
