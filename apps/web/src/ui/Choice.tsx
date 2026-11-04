import { useHelp } from './Help.tsx';

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
  const helpParts = useHelp(title, testId, help);
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
        {helpParts.button}
      </span>
      {helpParts.text}
    </>
  );
}
