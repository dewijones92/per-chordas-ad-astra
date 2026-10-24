import type { LoadState } from './use-annotations.ts';

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
        Could not load the drawings, so drawing is paused to protect them: {error}{' '}
        <button type="button" className="btn small" onClick={reload}>
          Retry
        </button>
      </p>
    );
  if (load === 'ready' && error)
    return (
      <p className="error loading-strip" data-testid="drawings-save-error">
        Drawings not saved yet: {error}
      </p>
    );
  if (load === 'loading') return <p className="muted loading-strip">Loading drawings…</p>;
  return null;
}
