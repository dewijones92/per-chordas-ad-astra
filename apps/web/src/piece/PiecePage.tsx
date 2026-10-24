import {
  AUDIO_ACCEPT,
  kindOfFile,
  MUSIC_ACCEPT,
  newId,
  parseTags,
  SCORE_ACCEPT,
  type FileKind,
  type PieceView,
  type Piece,
  type PiecePatch,
  type PracticeSession,
} from '@pcaa/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { api } from '../api/client.ts';
import { Toolbar } from '../annotate/Toolbar.tsx';
import { DrawingStatus } from '../annotate/DrawingStatus.tsx';
import { isTypingTarget } from '../annotate/tools.ts';
import { useDrawing } from '../annotate/use-drawing.ts';
import { useRememberedZoom } from '../score/use-remembered-zoom.ts';
import { useWheelZoom } from '../score/use-wheel-zoom.ts';
import { useAnnotations } from '../annotate/use-annotations.ts';
import { usePdfMarks } from '../annotate/use-pdf-marks.ts';
import { Looper } from '../looper/Looper.tsx';
import { MetronomePanel } from '../metronome/MetronomePanel.tsx';
import { PlayAlong } from '../music/PlayAlong.tsx';
import { useMetronome } from '../metronome/MetronomeProvider.tsx';
import { BpmChart } from '../practice/BpmChart.tsx';
import { PracticeTimer } from '../practice/PracticeTimer.tsx';
import { bestBpmByDay } from '../practice/stats.ts';
import { formatMinutes } from '../practice/timer.ts';
import type { PDFPageProxy } from '../score/pdf.ts';
import { ScoreViewer, type ScoreViewerHandle, type ViewMode } from '../score/ScoreViewer.tsx';
import { stepZoom, zoomKeyOf } from '../score/zoom.ts';
import {
  pullResume,
  readResume,
  rememberOpened,
  rememberPieceView,
  rememberPieceScore,
  savedPieceView,
  rememberScore,
  rememberViewMode,
  savedViewMode,
  scoreKey,
} from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { useDraft } from '../ui/use-draft.ts';
import './piece.css';
import { names, strings, tips } from '../strings.ts';

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
  { mode: 'page', label: strings.piece.layouts.page, title: tips.piece.layouts.page },
  { mode: 'spread', label: strings.piece.layouts.spread, title: tips.piece.layouts.spread },
  { mode: 'width', label: strings.piece.layouts.width, title: tips.piece.layouts.width },
];
const FILE_ICON: Record<FileKind, string> = { scores: '📄', tracks: '🎧', music: '🎹' };

const VIEW_CHOICES: { mode: PieceView; label: string; title: string }[] = [
  { mode: 'score', label: strings.piece.views.score, title: tips.piece.views.score },
  { mode: 'split', label: strings.piece.views.split, title: tips.piece.views.split },
  { mode: 'notes', label: strings.piece.views.notes, title: tips.piece.views.notes },
];

function ScoreArea({
  piece,
  file,
  onPatch,
}: {
  piece: Piece;
  file: string;
  onPatch: (p: PiecePatch) => void;
}) {
  const { history, dispatch, load, error, reload, adopt } = useAnnotations(piece.id, file);
  const scoreUrl = api.fileUrl(piece.id, file);
  const [opened, setOpened] = useState<{ url: string; pages: PDFPageProxy[] } | null>(null);
  const pdfMarks = usePdfMarks({
    pieceId: piece.id,
    file,
    pages: opened?.url === scoreUrl ? opened.pages : null,
    load,
    doc: history.present,
    adopt,
  });
  const { tools, selected, setSelected, toolbar } = useDrawing('score', history, dispatch);
  const spot = scoreKey(piece.id, file);
  const [zoom, setZoom] = useRememberedZoom(spot);
  const [mode, setMode] = useState<ViewMode>(savedViewMode);
  const [initialPosition] = useState(() => readResume().scores[spot] ?? null);
  const viewer = useRef<ScoreViewerHandle>(null);
  const metronome = useMetronome();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const zoomKey = zoomKeyOf(e);
      if (zoomKey) {
        e.preventDefault();
        setZoom((from) => {
          const to = zoomKey === 'reset' ? 1 : stepZoom(from, zoomKey === 'in' ? 1 : -1);
          console.info('dewidebug score zoom by key', { key: e.key, action: zoomKey, from, to });
          return to;
        });
        return;
      }
      if (isTypingTarget(e.target)) return;
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
      } else if (e.key === '+' || e.key === '=') {
        metronome.setBpm(metronome.settings.bpm + 1);
      } else if (e.key === '-') {
        metronome.setBpm(metronome.settings.bpm - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [metronome, setZoom]);

  useWheelZoom(window, setZoom, 'score');

  return (
    <div className="score-area">
      <Toolbar
        {...toolbar}
        zoom={zoom}
        onZoom={setZoom}
        extra={
          <span className="view-modes" role="group" aria-label={tips.piece.layoutGroup}>
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
                  rememberViewMode(m.mode);
                }}
              >
                {m.label}
              </button>
            ))}
          </span>
        }
      />
      <DrawingStatus load={load} error={error} reload={reload} />
      <div className="score-frame" data-pdf-marks={pdfMarks.importing ? 'checking' : 'checked'}>
        <ScoreViewer
          readOnly={load !== 'ready'}
          hidePdfAnnotations={pdfMarks.hidePdfAnnotations}
          onPages={setOpened}
          url={scoreUrl}
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
      title={tips.piece.bookmark}
      onClick={() => {
        const position = getPosition();
        if (!position) return;
        const name = window.prompt(strings.piece.bookmarkPrompt, `Page ${String(position.page)}`);
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
      {strings.piece.bookmark}
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
    <div className="jump-bar row" aria-label={tips.piece.bookmarks} data-testid="jump-bar">
      <BookmarkButton piece={piece} file={file} onPatch={onPatch} getPosition={getPosition} />
      {marks.length > 0 && <span className="muted">{strings.piece.jumpTo}</span>}
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
            aria-label={tips.piece.deleteBookmark(b.name)}
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
        {busy ? strings.piece.uploading : label}
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
      placeholder={tips.piece.notesPlaceholder}
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
  const [chosenView, setChosenView] = useState<{ mode: PieceView; file: string | null } | null>(
    null,
  );
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

  const loaded = current !== undefined;
  useEffect(() => {
    if (!loaded) return;
    rememberOpened(id);
    console.info('dewidebug piece opened; stamped for the library', { id });
  }, [id, loaded]);

  if (piece.error) {
    return (
      <div className="piece-missing">
        <p className="error">{piece.error}</p>
        <Link href="/">{strings.nav.backToLibrary}</Link>
      </div>
    );
  }
  if (!current || freshResume.loading)
    return <p className="muted piece-missing">{strings.common.loading}</p>;

  const preferredScore = chosenScore ?? readResume().pieceScore[id]?.file ?? null;
  const scoreFile = current.scores.some((s) => s.file === preferredScore)
    ? preferredScore
    : (current.scores[0]?.file ?? null);
  const lists = setlists.data?.setlists ?? [];
  const pieceSessions = sessions.data ?? [];
  const totalSec = pieceSessions.reduce((sum, s) => sum + s.durationSec, 0);
  const wantedView = chosenView ?? savedPieceView(id);
  const musicRef =
    current.music.find((m) => m.file === wantedView?.file) ?? current.music[0] ?? null;
  const viewMode: PieceView = !musicRef
    ? 'score'
    : !scoreFile
      ? 'notes'
      : (wantedView?.mode ?? 'split');
  const chooseView = (mode: PieceView, file: string | null) => {
    console.info('dewidebug piece view chosen', { id, mode, file });
    setChosenView({ mode, file });
    rememberPieceView(id, mode, file);
  };
  const transposeMusic = (file: string, semitones: number) => {
    const music = current.music.map((m) => (m.file === file ? { ...m, transpose: semitones } : m));
    console.info('dewidebug transpose', { id, file, semitones });
    setData((p) => (p ? { ...p, music } : p));
    stablePatch({ music });
  };

  return (
    <div className="piece-page">
      <header className="piece-head">
        <Link href="/" className="btn small ghost">
          {strings.piece.library}
        </Link>
        <div className="piece-title">
          <h1
            data-testid="piece-title"
            title={tips.piece.rename}
            onClick={() => {
              const title = window.prompt(strings.piece.renamePrompt, current.title);
              if (title?.trim()) stablePatch({ title: title.trim() });
            }}
          >
            {current.title}
          </h1>
          {current.artist && <span className="muted">{current.artist}</span>}
          <button
            type="button"
            className="btn small ghost pin-toggle"
            aria-pressed={current.pinned}
            data-testid="piece-pin"
            title={current.pinned ? tips.piece.unpin : tips.piece.pin}
            onClick={() => {
              stablePatch({ pinned: !current.pinned });
            }}
          >
            {current.pinned ? strings.piece.pinned : strings.piece.pin}
          </button>
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
        {musicRef && (
          <div className="row piece-views" role="group" aria-label={tips.piece.viewGroup}>
            {VIEW_CHOICES.filter((v) => scoreFile !== null || v.mode === 'notes').map((v) => (
              <button
                key={v.mode}
                type="button"
                className="btn small"
                aria-pressed={viewMode === v.mode}
                data-piece-view={v.mode}
                title={v.title}
                onClick={() => {
                  chooseView(v.mode, musicRef.file);
                }}
              >
                {v.label}
              </button>
            ))}
            {current.music.length > 1 && (
              <select
                className="input mini"
                aria-label={tips.piece.musicFile}
                value={musicRef.file}
                onChange={(e) => {
                  chooseView(viewMode === 'score' ? 'split' : viewMode, e.target.value);
                }}
              >
                {current.music.map((m) => (
                  <option key={m.file} value={m.file}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>

      <div className="piece-body">
        <div className={`piece-main view-${viewMode}`}>
          {viewMode !== 'notes' &&
            (scoreFile ? (
              <ScoreArea key={scoreFile} piece={current} file={scoreFile} onPatch={stablePatch} />
            ) : (
              <div className="no-score">
                <div className="card empty-state">
                  <h2>{strings.piece.addScore}</h2>
                  <p>{strings.piece.addScoreHint}</p>
                  <UploadButton
                    label={strings.piece.uploadPdf}
                    accept={SCORE_ACCEPT}
                    testId="upload-score-empty"
                    onFile={async (f) => {
                      await api.uploadScore(current.id, f);
                      piece.reload();
                    }}
                  />
                </div>
              </div>
            ))}
          {viewMode !== 'score' && musicRef && (
            <PlayAlong
              key={musicRef.file}
              pieceId={current.id}
              music={musicRef}
              spaceToggles={viewMode === 'notes'}
              onTranspose={(semitones) => {
                transposeMusic(musicRef.file, semitones);
              }}
            />
          )}
        </div>

        <aside className="dock" aria-label={tips.piece.dock}>
          <Section title={strings.piece.sections.metronome} testId="dock-metronome">
            <MetronomePanel compact />
            {current.targetBpm !== null && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  metronome.setBpm(current.targetBpm ?? metronome.settings.bpm);
                }}
              >
                {strings.piece.useTarget(current.targetBpm)}
              </button>
            )}
          </Section>

          <Section title={strings.piece.sections.practise} testId="dock-practice">
            <PracticeTimer
              pieceId={current.id}
              onLogged={(s: PracticeSession) => {
                sessions.setData((list) => [...(list ?? []), s]);
              }}
            />
            <p className="muted small-print">
              {strings.piece.sessionsTotal(pieceSessions.length, formatMinutes(totalSec))}
            </p>
            <label className="row small-field">
              {strings.piece.targetTempo}
              <TargetTempoField piece={current} onPatch={stablePatch} />
            </label>
            <BpmChart points={bestBpmByDay(pieceSessions)} target={current.targetBpm} />
          </Section>

          <Section title={strings.piece.sections.looper} testId="dock-looper">
            <Looper pieceId={current.id} tracks={current.tracks} />
            <div className="row">
              <UploadButton
                label={strings.piece.addTrack}
                accept={AUDIO_ACCEPT}
                testId="upload-track"
                onFile={async (f) => {
                  await api.uploadTrack(current.id, f);
                  piece.reload();
                }}
              />
            </div>
          </Section>

          <Section
            title={strings.piece.sections.playAlong}
            testId="dock-playalong"
            open={current.music.length > 0}
          >
            {current.music.length === 0 && <p className="muted">{strings.piece.playAlongEmpty}</p>}
            {current.music.length > 0 && (
              <ul className="file-list">
                {current.music.map((m) => (
                  <li key={m.file} className="row">
                    <span>🎹</span>
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={() => {
                        chooseView(scoreFile ? 'split' : 'notes', m.file);
                      }}
                    >
                      {m.name}
                    </button>
                    {m.transpose !== 0 && (
                      <span className="muted">
                        {m.transpose > 0 ? '+' : '−'}
                        {Math.abs(m.transpose)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <UploadButton
                label={strings.piece.addMusic}
                accept={MUSIC_ACCEPT}
                testId="upload-music"
                onFile={async (f) => {
                  const ref = await api.uploadMusic(current.id, f);
                  piece.reload();
                  chooseView(scoreFile ? 'split' : 'notes', ref.file);
                }}
              />
            </div>
            <p className="muted small-print">
              {names.pianoCredit}{' '}
              <a
                href="https://creativecommons.org/licenses/by/3.0/"
                target="_blank"
                rel="noreferrer"
              >
                {names.pianoLicence}
              </a>
            </p>
            <p className="muted small-print">{strings.piece.playAlongKeys}</p>
          </Section>

          <Section title={strings.piece.sections.notes} open={current.notes !== ''}>
            <NotesEditor piece={current} onPatch={stablePatch} />
          </Section>

          <Section title={strings.piece.sections.tags} open={false}>
            <label className="field">
              {strings.newPiece.tags}
              <TagsField piece={current} onPatch={stablePatch} />
            </label>
            {lists.length === 0 && <p className="muted">{strings.piece.noSetlists}</p>}
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

          <Section title={strings.piece.sections.files} open={false}>
            <ul className="file-list">
              {[...current.scores, ...current.tracks, ...current.music].map((f) => (
                <li key={f.file} className="row">
                  <span>{FILE_ICON[kindOfFile(f.file) ?? 'tracks']}</span>
                  <a href={api.fileUrl(current.id, f.file)} target="_blank" rel="noreferrer">
                    {f.name}
                  </a>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn small ghost"
                    aria-label={tips.piece.remove(f.name)}
                    onClick={() => {
                      if (
                        !window.confirm(
                          strings.piece.removeConfirm(f.name, kindOfFile(f.file) !== 'tracks'),
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
                label={strings.piece.addPdf}
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
                if (!window.confirm(strings.piece.deleteConfirm(current.title))) return;
                void api.deletePiece(current.id).then(() => {
                  navigate('/');
                });
              }}
            >
              {strings.piece.deletePiece}
            </button>
          </Section>
        </aside>
      </div>
    </div>
  );
}
