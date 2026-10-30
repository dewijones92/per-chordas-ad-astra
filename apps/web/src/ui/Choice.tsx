export function Choice<T extends string>({
  label,
  title,
  value,
  options,
  testId,
  onChange,
}: {
  label: string;
  title: string;
  value: T;
  options: readonly { value: T; label: string }[];
  testId: string;
  onChange: (value: T) => void;
}) {
  return (
    <span className="playalong-field" role="group" aria-label={title} data-testid={testId}>
      <span>{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="btn small"
          aria-pressed={value === o.value}
          data-choice={o.value}
          onClick={() => {
            if (value !== o.value)
              console.info('dewidebug choice', { testId, from: value, to: o.value });
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
