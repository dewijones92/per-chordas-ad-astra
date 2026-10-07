import {
  AUDIO_ACCEPT,
  kindOfFile,
  newId,
  parseTags,
  SCORE_ACCEPT,
  type Piece,
  type PiecePatch,
  type PracticeSession,
} from '@pcaa/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { api } from '../api/client.ts';
import { Toolbar } from '../annotate/Toolbar.tsx';
import { defaultToolState, isTypingTarget, TOOL_KEYS, type ToolState } from '../annotate/tools.ts';
import { useAnnotations } from '../annotate/use-annotations.ts';
import { Looper } from '../looper/Looper.tsx';
import { MetronomePanel } from '../metronome/MetronomePanel.tsx';
import { useMetronome } from '../metronome/MetronomeProvider.tsx';
import { BpmChart } from '../practice/BpmChart.tsx';
import { PracticeTimer } from '../practice/PracticeTimer.tsx';
import { bestBpmByDay } from '../practice/stats.ts';
import { formatMinutes } from '../practice/timer.ts';
import { ScoreViewer, type ScoreViewerHandle, type ViewMode } from '../score/ScoreViewer.tsx';
import {
  pullResume,
  readResume,
  rememberPieceScore,
  rememberScore,
  scoreKey,
} from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { useDraft } from '../ui/use-draft.ts';
import './piece.css';

function Section({
  title,
  children,
  open = true,
  testId,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  testId?: string;
}) {
  return (
    <details className="dock-section" open={open} data-testid={testId}>
      <summary>
        <h3>{title}</h3>
      </summary>
      <div className="dock-body">{children}</div>
    </details>
  );
}

const VIEW_MODES: { mode: ViewMode; label: string; title: string }[] = [
  { mode: 'page', label: '▯ Page', title: 'Fit one whole page' },
  { mode: 'spread', label: '▯▯ Two', title: 'Two pages side by side' },
  { mode: 'width', label: '↔ Width', title: 'Fit the page width' },
];
const VIEW_KEY = 'pcaa.score.view.v1';

function loadViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    return VIEW_MODES.some((m) => m.mode === stored) ? (stored as ViewMode) : 'page';
  } catch {
    return 'page';
  }
}

function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    return;
  }
}

function ScoreArea({
  piece,
  file,
  onPatch,
}: {
  piece: Piece;
  file: string;
  onPatch: (p: PiecePatch) => void;
}) {
  const { history, dispatch, load, error, reload } = useAnnotations(piece.id, file);
  const [tools, setTools] = useState<ToolState>(defaultToolState);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<ViewMode>(loadViewMode);
  const [initialPosition] = useState(() => readResume().scores[scoreKey(piece.id, file)] ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const viewer = useRef<ScoreViewerHandle>(null);
  const metronome = useMetronome();

  const selectedPage = selected
    ? Object.entries(history.present.pages).find(([, items]) =>
        items.some((i) => i.id === selected),
      )?.[0]
    : undefined;
  const deleteSelected = useMemo(
    () =>
      selected && selectedPage
        ? () => {
            dispatch({ type: 'remove', page: Number(selectedPage), ids: [selected] });
            setSelected(null);
          }
        : null,
    [selected, selectedPage, dispatch],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        viewer.current?.turn(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        viewer.current?.turn(-1);
      } else if (e.key === ' ') {
        e.preventDefault();
        metronome.toggle();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && deleteSelected) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelected(null);
      } else if (e.key === '+' || e.key === '=') {
        metronome.setBpm(metronome.settings.bpm + 1);
      } else if (e.key === '-') {
        metronome.setBpm(metronome.settings.bpm - 1);
      } else if (TOOL_KEYS[key]) {
        const tool = TOOL_KEYS[key];
        setTools((t) => ({ ...t, tool }));
        if (tool !== 'select') setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [dispatch, deleteSelected, metronome]);

  return (
    <div className="score-area">
      <Toolbar
        tools={tools}
        onChange={(patch) => {
          setTools((t) => ({ ...t, ...patch }));
          if (patch.tool && patch.tool !== 'select') setSelected(null);
        }}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => {
          dispatch({ type: 'undo' });
        }}
        onRedo={() => {
          dispatch({ type: 'redo' });
        }}
        onDeleteSelected={deleteSelected}
        zoom={zoom}
        onZoom={setZoom}
        extra={
          <span className="view-modes" role="group" aria-label="Page layout">
            {VIEW_MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                className="btn small"
                aria-pressed={mode === m.mode}
                title={m.title}
                data-view={m.mode}
                onClick={() => {
                  setMode(m.mode);
                  saveViewMode(m.mode);
                }}
              >
                {m.label}
              </button>
            ))}
          </span>
        }
      />
      {load === 'error' && (
        <p className="error loading-strip" data-testid="drawings-error">
          Could not load the drawings, so drawing is paused to protect them: {error}{' '}
          <button type="button" className="btn small" onClick={reload}>
            Retry
          </button>
        </p>
      )}
      {load === 'ready' && error && (
        <p className="error loading-strip" data-testid="drawings-save-error">
          Drawings not saved yet: {error}
        </p>
      )}
      {load === 'loading' && <p className="muted loading-strip">Loading drawings…</p>}
      <div className="score-frame">
        <ScoreViewer
          readOnly={load !== 'ready'}
          url={api.fileUrl(piece.id, file)}
          history={history}
          dispatch={dispatch}
          tools={tools}
          zoom={zoom}
          mode={mode}
          selected={selected}
          onSelect={setSelected}
          handleRef={viewer}
          initialPosition={initialPosition}
          onPositionChange={(position) => {
            rememberScore(scoreKey(piece.id, file), position);
          }}
        />
      </div>
      <JumpTargets
        piece={piece}
        file={file}
        onPatch={onPatch}
        onJump={(p) => viewer.current?.goTo(p)}
        getPosition={() => viewer.current?.position() ?? null}
      />
    </div>
  );
}

function BookmarkButton({
  piece,
  file,
  onPatch,
  getPosition,
}: {
  piece: Piece;
  file: string;
  onPatch: (p: PiecePatch) => void;
  getPosition: () => { page: number; y: number } | null;
}) {
  return (
    <button
      type="button"
      className="btn small sun"
      data-testid="add-bookmark"
      title="Bookmark the current position"
      onClick={() => {
        const position = getPosition();
        if (!position) return;
        const name = window.prompt(
          'Name this spot (e.g. "Bars 17–32")',
          `Page ${String(position.page)}`,
        );
        if (!name?.trim()) return;
        const bookmarks = [
          ...piece.bookmarks,
          {
            id: newId(),
            name: name.trim(),
            score: file as Piece['bookmarks'][number]['score'],
            ...position,
          },
        ];
        onPatch({ bookmarks });
      }}
    >
      🔖 Bookmark
    </button>
  );
}

function JumpTargets({
  piece,
  file,
  onPatch,
  onJump,
  getPosition,
}: {
  piece: Piece;
  file: string;
  onPatch: (p: PiecePatch) => void;
  onJump: (p: { page: number; y: number }) => void;
  getPosition: () => { page: number; y: number } | null;
}) {
  const marks = piece.bookmarks.filter((b) => b.score === file);
  return (
    <div className="jump-bar row" aria-label="Bookmarks" data-testid="jump-bar">
      <BookmarkButton piece={piece} file={file} onPatch={onPatch} getPosition={getPosition} />
      {marks.length > 0 && <span className="muted">Jump to</span>}
      {marks.map((b) => (
        <span key={b.id} className="jump">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              onJump(b);
            }}
          >
            {b.name}
          </button>
          <button
            type="button"
            className="btn small ghost"
            aria-label={`Delete bookmark ${b.name}`}
            onClick={() => {
              onPatch({ bookmarks: piece.bookmarks.filter((x) => x.id !== b.id) });
            }}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

function UploadButton({
  label,
  accept,
  onFile,
  testId,
}: {
  label: string;
  accept: string;
  onFile: (f: File) => Promise<void>;
  testId: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        data-testid={testId}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          setError(null);
          onFile(f)
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      />
      <button
        type="button"
        className="btn small"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Uploading…' : label}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}

type Patcher = (p: PiecePatch, keepalive?: boolean) => void;

function NotesEditor({ piece, onPatch }: { piece: Piece; onPatch: Patcher }) {
  const [notes, setNotes] = useDraft(piece.notes, (value, keepalive) => {
    if (value !== piece.notes) onPatch({ notes: value }, keepalive);
  });
  return (
    <textarea
      className="input"
      rows={5}
      value={notes}
      placeholder="Practice notes, chord shapes, what to focus on…"
      onChange={(e) => {
        setNotes(e.target.value);
      }}
      data-testid="piece-notes"
    />
  );
}

function TargetTempoField({ piece, onPatch }: { piece: Piece; onPatch: Patcher }) {
  const [text, setText] = useDraft(String(piece.targetBpm ?? ''), (value, keepalive) => {
    const parsed = value.trim() === '' ? null : Math.round(Number(value));
    const next =
      parsed !== null && Number.isFinite(parsed) && parsed >= 20 && parsed <= 400 ? parsed : null;
    if (next !== piece.targetBpm && (value.trim() === '' || next !== null))
      onPatch({ targetBpm: next }, keepalive);
  });
  return (
    <input
      className="input mini"
      type="number"
      min={20}
      max={400}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
      }}
      data-testid="target-bpm"
    />
  );
}

function TagsField({ piece, onPatch }: { piece: Piece; onPatch: Patcher }) {
  const [text, setText] = useDraft(piece.tags.join(', '), (value, keepalive) => {
    const tags = parseTags(value);
    if (tags.join(',') !== piece.tags.join(',')) onPatch({ tags }, keepalive);
  });
  return (
    <input
      className="input"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
      }}
      data-testid="piece-tags"
    />
  );
}

export function PiecePage({ id }: { id: string }) {
  const piece = useAsync(() => api.getPiece(id), `piece:${id}`);
  const freshResume = useAsync(() => pullResume(800), `resume:${id}`);
  const sessions = useAsync(() => api.listSessions(id), `sessions:${id}`);
  const setlists = useAsync(() => api.getSetlists(), 'setlists');
  const [chosenScore, setChosenScore] = useState<string | null>(null);
  const setScoreFile = useCallback(
    (file: string) => {
      setChosenScore(file);
      rememberPieceScore(id, file);
    },
    [id],
  );
  const [, navigate] = useLocation();
  const metronome = useMetronome();
  const current = piece.data;

  const { setData, reload } = piece;
  const stablePatch = useCallback(
    (p: PiecePatch, keepalive = false) => {
      api.patchPiece(id, p, keepalive).then(
        (next) => {
          setData(() => next);
        },
        (e: unknown) => {
          console.warn('dewidebug piece patch failed', { id, error: String(e) });
          reload();
        },
      );
    },
    [id, setData, reload],
  );

  if (piece.error) {
    return (
      <div className="piece-missing">
        <p className="error">{piece.error}</p>
        <Link href="/">← Back to the library</Link>
      </div>
    );
  }
  if (!current || freshResume.loading) return <p className="muted piece-missing">Loading…</p>;

  const preferredScore = chosenScore ?? readResume().pieceScore[id]?.file ?? null;
  const scoreFile = current.scores.some((s) => s.file === preferredScore)
    ? preferredScore
    : (current.scores[0]?.file ?? null);
  const lists = setlists.data?.setlists ?? [];
  const pieceSessions = sessions.data ?? [];
  const totalSec = pieceSessions.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div className="piece-page">
      <header className="piece-head">
        <Link href="/" className="btn small ghost">
          ← Library
        </Link>
        <div className="piece-title">
          <h1
            data-testid="piece-title"
            title="Click to rename"
            onClick={() => {
              const title = window.prompt('Title', current.title);
              if (title?.trim()) stablePatch({ title: title.trim() });
            }}
          >
            {current.title}
          </h1>
          {current.artist && <span className="muted">{current.artist}</span>}
        </div>
        {current.scores.length > 1 && (
          <div className="row score-tabs" role="tablist">
            {current.scores.map((s) => (
              <button
                key={s.file}
                type="button"
                role="tab"
                aria-selected={s.file === scoreFile}
                className="btn small"
                aria-pressed={s.file === scoreFile}
                onClick={() => {
                  setScoreFile(s.file);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="piece-body">
        <div className="piece-main">
          {scoreFile ? (
            <ScoreArea key={scoreFile} piece={current} file={scoreFile} onPatch={stablePatch} />
          ) : (
            <div className="no-score">
              <div className="card empty-state">
                <h2>Add a score 📄</h2>
                <p>Upload a PDF and draw fingerings, strum arrows and notes straight onto it.</p>
                <UploadButton
                  label="Upload PDF"
                  accept={SCORE_ACCEPT}
                  testId="upload-score-empty"
                  onFile={async (f) => {
                    await api.uploadScore(current.id, f);
                    piece.reload();
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <aside className="dock" aria-label="Practice tools">
          <Section title="⏱ Metronome" testId="dock-metronome">
            <MetronomePanel compact />
            {current.targetBpm !== null && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  metronome.setBpm(current.targetBpm ?? metronome.settings.bpm);
                }}
              >
                Use target ({current.targetBpm} bpm)
              </button>
            )}
          </Section>

          <Section title="🎯 Practise" testId="dock-practice">
            <PracticeTimer
              pieceId={current.id}
              onLogged={(s: PracticeSession) => {
                sessions.setData((list) => [...(list ?? []), s]);
              }}
            />
            <p className="muted small-print">
              {pieceSessions.length} sessions · {formatMinutes(totalSec)} in total
            </p>
            <label className="row small-field">
              Target tempo
              <TargetTempoField piece={current} onPatch={stablePatch} />
            </label>
            <BpmChart points={bestBpmByDay(pieceSessions)} target={current.targetBpm} />
          </Section>

          <Section title="🔁 Slow-down looper" testId="dock-looper">
            <Looper pieceId={current.id} tracks={current.tracks} />
            <div className="row">
              <UploadButton
                label="+ Add backing track"
                accept={AUDIO_ACCEPT}
                testId="upload-track"
                onFile={async (f) => {
                  await api.uploadTrack(current.id, f);
                  piece.reload();
                }}
              />
            </div>
          </Section>

          <Section title="📝 Notes" open={current.notes !== ''}>
            <NotesEditor piece={current} onPatch={stablePatch} />
          </Section>

          <Section title="🏷 Tags & setlists" open={false}>
            <label className="field">
              Tags (comma separated)
              <TagsField piece={current} onPatch={stablePatch} />
            </label>
            {lists.length === 0 && <p className="muted">Create setlists from the library.</p>}
            {lists.map((s) => (
              <label key={s.id} className="row small-field">
                <input
                  type="checkbox"
                  checked={s.pieceIds.includes(current.id)}
                  onChange={(e) => {
                    const next = {
                      setlists: lists.map((l) =>
                        l.id !== s.id
                          ? l
                          : {
                              ...l,
                              pieceIds: e.target.checked
                                ? [...l.pieceIds, current.id]
                                : l.pieceIds.filter((p) => p !== current.id),
                            },
                      ),
                    };
                    setlists.setData(() => next);
                    void api.putSetlists(next);
                  }}
                />
                {s.name}
              </label>
            ))}
          </Section>

          <Section title="📁 Files" open={false}>
            <ul className="file-list">
              {[...current.scores, ...current.tracks].map((f) => (
                <li key={f.file} className="row">
                  <span>{kindOfFile(f.file) === 'scores' ? '📄' : '🎧'}</span>
                  <a href={api.fileUrl(current.id, f.file)} target="_blank" rel="noreferrer">
                    {f.name}
                  </a>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn small ghost"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove “${f.name}”${kindOfFile(f.file) === 'scores' ? ' and its drawings' : ''}? It stays in the GitHub history.`,
                        )
                      )
                        return;
                      void api.removeFile(current.id, f.file).then((next) => {
                        piece.setData(() => next);
                      });
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="row">
              <UploadButton
                label="+ Add PDF"
                accept={SCORE_ACCEPT}
                testId="upload-score"
                onFile={async (f) => {
                  const ref = await api.uploadScore(current.id, f);
                  piece.reload();
                  setScoreFile(ref.file);
                }}
              />
            </div>
            <button
              type="button"
              className="btn small coral"
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete “${current.title}”? It stays in the GitHub history, but leaves your library.`,
                  )
                )
                  return;
                void api.deletePiece(current.id).then(() => {
                  navigate('/');
                });
              }}
            >
              Delete piece
            </button>
          </Section>
        </aside>
      </div>
    </div>
  );
}
