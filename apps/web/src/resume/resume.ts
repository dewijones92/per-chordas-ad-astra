import {
  DEFAULT_PLAY_ALONG,
  DEFAULT_SORT,
  type PieceView,
  type PlayAlongPrefs,
  emptyResume,
  mergeResume,
  ResumeState,
  SortChoice,
  ViewMode,
} from '@pcaa/shared';

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
  looping: boolean;
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

export function rememberOpened(pieceId: string): void {
  updateResume((s) => ({ ...s, opened: { ...s.opened, [pieceId]: { at: now() } } }));
}

export function lastOpenedAt(state: ResumeState, pieceId: string): number | null {
  const prefix = `${pieceId}/`;
  const stamps = [
    state.opened[pieceId]?.at,
    state.pieceScore[pieceId]?.at,
    state.loopers[pieceId]?.at,
    state.timers[pieceId]?.at,
    ...Object.entries(state.scores)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v.at),
  ].filter((at): at is number => at !== undefined);
  return stamps.length > 0 ? Math.max(...stamps) : null;
}

export function rememberZoom(key: string, value: number): void {
  updateResume((s) => ({ ...s, zoom: { ...s.zoom, [key]: { value, at: now() } } }));
}

export function savedZoom(key: string): number | null {
  return readResume().zoom[key]?.value ?? null;
}

export function rememberPlayAlong(key: string, prefs: PlayAlongPrefs): void {
  updateResume((s) => ({ ...s, playAlong: { ...s.playAlong, [key]: { ...prefs, at: now() } } }));
}

export function savedPlayAlong(key: string): PlayAlongPrefs {
  const saved = readResume().playAlong[key];
  if (!saved) return DEFAULT_PLAY_ALONG;
  const { at: _at, ...prefs } = saved;
  return prefs;
}

export function rememberPieceView(pieceId: string, mode: PieceView, file: string | null): void {
  updateResume((s) => ({
    ...s,
    pieceView: { ...s.pieceView, [pieceId]: { mode, file, at: now() } },
  }));
}

export function savedPieceView(pieceId: string): { mode: PieceView; file: string | null } | null {
  const saved = readResume().pieceView[pieceId];
  return saved ? { mode: saved.mode, file: saved.file } : null;
}

export function rememberViewMode(mode: ViewMode): void {
  updateResume((s) => ({ ...s, viewMode: { mode, at: now() } }));
}

const LEGACY_VIEW_KEY = 'pcaa.score.view.v1';
const LEGACY_SORT_KEY = 'pcaa.library.sort.v1';

function legacy<T>(key: string, parse: (raw: string) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : parse(raw);
  } catch {
    return null;
  }
}

export function savedViewMode(): ViewMode {
  const fromResume = readResume().viewMode?.mode;
  if (fromResume) return fromResume;
  return legacy(LEGACY_VIEW_KEY, (raw) => ViewMode.safeParse(raw).data ?? null) ?? 'page';
}

export function rememberLibrarySort(choice: SortChoice): void {
  updateResume((s) => ({ ...s, librarySort: { ...choice, at: now() } }));
}

export function savedLibrarySort(): SortChoice {
  const fromResume = readResume().librarySort;
  if (fromResume) return { sort: fromResume.sort, reversed: fromResume.reversed };
  const old = legacy(LEGACY_SORT_KEY, (raw) => {
    try {
      return SortChoice.safeParse(JSON.parse(raw)).data ?? null;
    } catch {
      return null;
    }
  });
  return old ?? DEFAULT_SORT;
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
