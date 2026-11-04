import { useState } from 'react';
import { rememberLearnKey, savedLearnKey } from '../resume/resume.ts';
import { strings, tips } from '../strings.ts';

export function useLearnKey(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(savedLearnKey);
  return [
    on,
    (next) => {
      console.info('dewidebug learn key setting', { on: next });
      rememberLearnKey(next);
      setOn(next);
    },
  ];
}

export function LearnKeyToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="playalong-field" title={tips.playAlong.learnKey}>
      <input
        type="checkbox"
        checked={on}
        data-testid="learn-key"
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {strings.playAlong.learnKey}
    </label>
  );
}
