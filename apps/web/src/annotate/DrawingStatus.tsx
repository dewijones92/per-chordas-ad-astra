import type { LoadState } from './use-annotations.ts';
import { strings } from '../strings.ts';

export function DrawingStatus({
  load,
  error,
  reload,
}: {
  load: LoadState;
  error: string | null;
  reload: () => void;
}) {
  if (load === 'error')
    return (
      <p className="error loading-strip" data-testid="drawings-error">
        {strings.drawings.loadFailed} {error}{' '}
        <button type="button" className="btn small" onClick={reload}>
          {strings.drawings.retry}
        </button>
      </p>
    );
  if (load === 'ready' && error)
    return (
      <p className="error loading-strip" data-testid="drawings-save-error">
        {strings.drawings.notSaved} {error}
      </p>
    );
  if (load === 'loading') return <p className="muted loading-strip">{strings.drawings.loading}</p>;
  return null;
}
