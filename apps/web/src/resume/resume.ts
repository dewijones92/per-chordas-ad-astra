const KEY = 'pcaa.resume.v1';

export interface ScoreSpot {
  page: number;
  y: number;
}

export interface LooperSpot {
  track: string;
  positionSec: number;
  rate: number;
  loop: { startSec: number; endSec: number } | null;
}

export interface TimerSpot {
  accumulatedMs: number;
  startedAt: number;
}

export interface ResumeState {
  lastPath: string | null;
  scores: Record<string, ScoreSpot>;
  pieceScore: Record<string, string>;
  loopers: Record<string, LooperSpot>;
  timers: Record<string, TimerSpot>;
}

export const emptyResume = (): ResumeState => ({
  lastPath: null,
  scores: {},
  pieceScore: {},
  loopers: {},
  timers: {},
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseResume(raw: string | null): ResumeState {
  if (!raw) return emptyResume();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyResume();
    const base = emptyResume();
    return {
      lastPath: typeof parsed['lastPath'] === 'string' ? parsed['lastPath'] : null,
      scores: isRecord(parsed['scores'])
        ? (parsed['scores'] as ResumeState['scores'])
        : base.scores,
      pieceScore: isRecord(parsed['pieceScore'])
        ? (parsed['pieceScore'] as ResumeState['pieceScore'])
        : base.pieceScore,
      loopers: isRecord(parsed['loopers'])
        ? (parsed['loopers'] as ResumeState['loopers'])
        : base.loopers,
      timers: isRecord(parsed['timers'])
        ? (parsed['timers'] as ResumeState['timers'])
        : base.timers,
    };
  } catch {
    return emptyResume();
  }
}

export function readResume(): ResumeState {
  try {
    return parseResume(localStorage.getItem(KEY));
  } catch {
    return emptyResume();
  }
}

export function updateResume(update: (state: ResumeState) => ResumeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(update(readResume())));
  } catch {
    return;
  }
}

export function shouldResumeTo(currentPath: string, state: ResumeState): string | null {
  if (currentPath !== '/' || !state.lastPath || state.lastPath === '/') return null;
  return /^\/(piece\/[a-z0-9-]+|log|tools)$/.test(state.lastPath) ? state.lastPath : null;
}

export const scoreKey = (pieceId: string, file: string): string => `${pieceId}/${file}`;
