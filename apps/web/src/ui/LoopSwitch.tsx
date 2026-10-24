import { strings } from '../strings.ts';

export function LoopSwitch({
  on,
  disabled = false,
  onChange,
  testId,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  testId: string;
}) {
  return (
    <label className="loop-switch" title={strings.loop.switchTitle}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => {
          console.info('dewidebug loop switched', { testId, on: e.target.checked });
          onChange(e.target.checked);
        }}
      />
      <span>{strings.loop.switch}</span>
    </label>
  );
}
