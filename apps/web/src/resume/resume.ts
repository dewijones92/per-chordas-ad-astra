import { emptyResume, mergeResume, ResumeState } from '@pcaa/shared';

export type { ResumeState };
export { emptyResume };

const KEY = 'pcaa.resume.v2';
const PUSH_DEBOUNCE_MS = 1000;

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

export function parseResume(raw: string | null): ResumeState {
  if (!raw) return emptyResume();
  try {
    const parsed = ResumeState.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyResume();
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

function writeLocal(state: ResumeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

let pushTimer: number | undefined;

async function push(keepalive: boolean): Promise<void> {
  try {
    const res = await fetch('/api/resume', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(readResume()),
      keepalive,
    });
    if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText}`);
    const merged = ResumeState.safeParse(await res.json());
    if (merged.success) writeLocal(mergeResume(readResume(), merged.data));
  } catch (error) {
    console.info('dewidebug resume push failed; kept locally', { error: String(error) });
  }
}

export function flushResume(): void {
  window.clearTimeout(pushTimer);
  void push(true);
}

export function updateResume(update: (state: ResumeState) => ResumeState): void {
  writeLocal(update(readResume()));
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(false), PUSH_DEBOUNCE_MS);
}

export async function pullResume(timeoutMs = 1500): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch('/api/resume', { signal: controller.signal });
    if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText}`);
    const remote = ResumeState.safeParse(await res.json());
    if (remote.success) writeLocal(mergeResume(readResume(), remote.data));
    console.info('dewidebug resume pulled from server', {
      lastPath: readResume().lastPath?.path ?? null,
    });
  } catch (error) {
    console.info('dewidebug resume pull failed; using this browser only', { error: String(error) });
  } finally {
    window.clearTimeout(timer);
  }
}

const now = () => Date.now();

export function rememberPath(path: string): void {
  updateResume((s) => ({ ...s, lastPath: { path, at: now() } }));
}

export function rememberScore(key: string, spot: ScoreSpot): void {
  updateResume((s) => ({
    ...s,
    scores: { ...s.scores, [key]: { page: spot.page, y: spot.y, at: now() } },
  }));
}

export function rememberPieceScore(pieceId: string, file: string): void {
  updateResume((s) => ({ ...s, pieceScore: { ...s.pieceScore, [pieceId]: { file, at: now() } } }));
}

export function rememberLooper(pieceId: string, spot: LooperSpot): void {
  updateResume((s) => ({ ...s, loopers: { ...s.loopers, [pieceId]: { ...spot, at: now() } } }));
}

export function rememberTimer(pieceId: string, spot: TimerSpot | null): void {
  const value = spot ?? { accumulatedMs: 0, startedAt: 0 };
  updateResume((s) => ({ ...s, timers: { ...s.timers, [pieceId]: { ...value, at: now() } } }));
}

export function savedTimer(pieceId: string): TimerSpot | null {
  const spot = readResume().timers[pieceId];
  return spot && spot.accumulatedMs > 0
    ? { accumulatedMs: spot.accumulatedMs, startedAt: spot.startedAt }
    : null;
}

export function shouldResumeTo(currentPath: string, state: ResumeState): string | null {
  const last = state.lastPath?.path;
  if (currentPath !== '/' || !last || last === '/') return null;
  return /^\/(piece\/[a-z0-9-]+|log|tools)$/.test(last) ? last : null;
}

export const scoreKey = (pieceId: string, file: string): string => `${pieceId}/${file}`;
