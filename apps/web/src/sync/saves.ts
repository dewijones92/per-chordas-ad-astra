type Listener = () => void;

export interface SavesSnapshot {
  inFlight: number;
  lastError: string | null;
  lastSettledAt: number;
}

function createSaves() {
  let snapshot: SavesSnapshot = { inFlight: 0, lastError: null, lastSettledAt: 0 };
  const listeners = new Set<Listener>();
  const emit = (next: SavesSnapshot) => {
    snapshot = next;
    listeners.forEach((l) => {
      l();
    });
  };
  return {
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): SavesSnapshot => snapshot,
    track: async <T>(label: string, promise: Promise<T>): Promise<T> => {
      emit({ ...snapshot, inFlight: snapshot.inFlight + 1 });
      try {
        const value = await promise;
        emit({ inFlight: snapshot.inFlight - 1, lastError: null, lastSettledAt: Date.now() });
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.info('dewidebug save failed', { label, message });
        emit({
          inFlight: snapshot.inFlight - 1,
          lastError: `Could not save ${label}: ${message}`,
          lastSettledAt: Date.now(),
        });
        throw error;
      }
    },
  };
}

export const saves = createSaves();
