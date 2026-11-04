import { useState } from 'react';
import { strings, tips } from '../strings.ts';
import { KEYS_HELP } from './shortcuts.ts';

export function KeysHelp() {
  const [open, setOpen] = useState(false);
  return (
    <span className="keys-help-anchor">
      <button
        type="button"
        className="btn small ghost"
        aria-expanded={open}
        title={tips.keys.help}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {strings.keys.button}
      </button>
      {open && (
        <div className="keys-help" data-testid="keys-help" role="note" aria-label={tips.keys.help}>
          {KEYS_HELP.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </span>
  );
}
