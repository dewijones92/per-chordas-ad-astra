import type { PerBeat, Subdivision } from '@pcaa/shared';
import { strings, tips } from '../strings.ts';

const NOTE_VALUES: { value: Subdivision; label: string; title: string }[] = [
  { value: 1, label: '♩', title: tips.metronome.quarter },
  { value: 2, label: '♫', title: tips.metronome.eighth },
  { value: 3, label: '3', title: tips.metronome.triplet },
  { value: 4, label: '♬', title: tips.metronome.sixteenth },
];

export function NoteValues({
  value,
  onChange,
  label,
  auto = false,
  testId,
}: {
  value: PerBeat;
  onChange: (value: PerBeat) => void;
  label: string;
  auto?: boolean;
  testId?: string;
}) {
  return (
    <div
      className="row tight"
      role="group"
      aria-label={label}
      data-testid={testId}
      data-value={value}
    >
      {auto && (
        <button
          type="button"
          className="btn small"
          title={tips.noteValues.auto}
          aria-pressed={value === 'auto'}
          onClick={() => {
            onChange('auto');
          }}
        >
          {strings.noteValues.auto}
        </button>
      )}
      {NOTE_VALUES.map((s) => (
        <button
          key={s.value}
          type="button"
          className="btn small icon"
          title={s.title}
          aria-label={s.title}
          aria-pressed={value === s.value}
          onClick={() => {
            onChange(s.value);
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
