import { api } from '../api/client.ts';
import { describeSync } from './describe.ts';
import { useSaves, useServerSync } from './use-sync.ts';
import './sync.css';

export function SyncPill() {
  const local = useSaves();
  const { status, reachable } = useServerSync();
  const label = describeSync(local, status, reachable);
  const canFlush = status !== null && status.phase !== 'clean' && local.inFlight === 0;
  return (
    <button
      type="button"
      className={`sync-pill tone-${label.tone}`}
      title={label.detail}
      data-testid="sync-pill"
      data-tone={label.tone}
      disabled={!canFlush}
      onClick={() => void api.flush('button')}
    >
      <span className="dot" aria-hidden="true" />
      <span>{label.text}</span>
      <span className="visually-hidden">{label.detail}</span>
    </button>
  );
}
