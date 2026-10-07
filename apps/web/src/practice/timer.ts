export interface TimerState {
  runningSince: number | null;
  accumulatedMs: number;
  startedAt: number | null;
}

export const idleTimer = (): TimerState => ({
  runningSince: null,
  accumulatedMs: 0,
  startedAt: null,
});

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.runningSince !== null) return state;
  return {
    runningSince: now,
    accumulatedMs: state.accumulatedMs,
    startedAt: state.startedAt ?? now,
  };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.runningSince === null) return state;
  return {
    ...state,
    runningSince: null,
    accumulatedMs: state.accumulatedMs + (now - state.runningSince),
  };
}

export function elapsedMs(state: TimerState, now: number): number {
  return state.accumulatedMs + (state.runningSince === null ? 0 : now - state.runningSince);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h)}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(seconds: number): string {
  const minutes = seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${String(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m)} min`;
}
