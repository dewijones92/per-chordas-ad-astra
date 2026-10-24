import {
  LIBRARY_SORTS,
  LibrarySort,
  MUSIC_ACCEPT,
  newId,
  parseTags,
  SCORE_ACCEPT,
  type Piece,
  type SortChoice,
  type Setlist,
  type Setlists,
} from '@pcaa/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { api } from '../api/client.ts';
import { formatMinutes } from '../practice/timer.ts';
import {
  lastOpenedAt,
  readResume,
  rememberLibrarySort,
  savedLibrarySort,
} from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { allTags, buildPieceIndex, filterPieces } from './search.ts';
import {
  ago,
  buildStats,
  NO_STATS,
  pickForMe,
  recentlyOpened,
  SORT_LABELS,
  sortPieces,
  type PieceStats,
  type SortKey,
} from './sort.ts';
import './library.css';

function NewPieceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [, navigate] = useLocation();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [musicNote, setMusicNote] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ score: File | null; music: File | null }>({
    score: null,
    music: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const chooseMusic = async (chosen: File | null) => {
    setMusic(chosen);
    setMusicNote(null);
    if (!chosen) return;
    const fallback = chosen.name.replace(/\.[^.]+$/, '');
    try {
      const { loadScore } = await import('../music/load.ts');
      const score = loadScore(new Uint8Array(await chosen.arrayBuffer()));
      console.info('dewidebug new piece music read', {
        file: chosen.name,
        title: score.title,
        composer: score.composer,
      });
      setTitle((t) => (t.trim() ? t : score.title || fallback));
      setArtist((a) => (a.trim() ? a : score.composer));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('dewidebug new piece music unreadable', { file: chosen.name, error: message });
      setTitle((t) => (t.trim() ? t : fallback));
      setMusicNote(`This file could not be read for its title: ${message}`);
    }
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = createdId ?? (await api.createPiece({ title, artist, tags: parseTags(tags) })).id;
      setCreatedId(id);
      if (file && uploaded.score !== file) {
        await api.uploadScore(id, file);
        setUploaded((u) => ({ ...u, score: file }));
      }
      if (music && uploaded.music !== music) {
        await api.uploadMusic(id, music);
        setUploaded((u) => ({ ...u, music }));
      }
      console.info('dewidebug new piece created', {
        id,
        score: file?.name ?? null,
        music: music?.name ?? null,
      });
      navigate(`/piece/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog card" onClose={onClose} data-testid="new-piece-dialog">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>New piece ✦</h2>
        <label className="field">
          Title
          <input
            className="input"
            required
            autoFocus
            readOnly={createdId !== null}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            name="title"
          />
        </label>
        <label className="field">
          Artist / composer
          <input
            className="input"
            value={artist}
            onChange={(e) => {
              setArtist(e.target.value);
            }}
            name="artist"
          />
        </label>
        <label className="field">
          Tags (comma separated)
          <input
            className="input"
            value={tags}
            placeholder="fingerstyle, learning"
            onChange={(e) => {
              setTags(e.target.value);
            }}
            name="tags"
          />
        </label>
        <label className="field">
          Score PDF (optional)
          <input
            className="input"
            type="file"
            accept={SCORE_ACCEPT}
            name="score"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        <label className="field">
          MuseScore / MusicXML for Play-along (optional)
          <input
            className="input"
            type="file"
            accept={MUSIC_ACCEPT}
            name="music"
            onChange={(e) => {
              void chooseMusic(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        {musicNote && <p className="muted small-print">{musicNote}</p>}
        {error && <p className="error">{error}</p>}
        {error && createdId && (
          <p className="muted">
            The piece was created. Pick another file and press Create again, or{' '}
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                navigate(`/piece/${createdId}`);
              }}
            >
              open it as it is
            </button>
          </p>
        )}
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy || title.trim() === ''}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

function sortContext(sort: SortKey, piece: Piece, stats: PieceStats, now: number): string | null {
  switch (sort) {
    case 'added':
      return `Added ${ago(Date.parse(piece.createdAt), now)}`;
    case 'edited':
      return `Edited ${ago(Date.parse(piece.updatedAt), now)}`;
    case 'opened':
      return stats.lastOpenedAt === null
        ? 'Not opened yet'
        : `Opened ${ago(stats.lastOpenedAt, now)}`;
    case 'setlist':
    case 'title':
    case 'artist':
    case 'practised':
    case 'neglected':
    case 'most-practised':
    case 'tempo':
      return null;
  }
}

function PieceCard({
  piece,
  stats,
  sort,
  now,
  practiceKnown,
  setlist,
  onPin,
  onMove,
  onRemove,
}: {
  piece: Piece;
  stats: PieceStats;
  sort: SortKey;
  now: number;
  practiceKnown: boolean;
  setlist: Setlist | null;
  onPin: () => void;
  onMove: ((delta: -1 | 1) => void) | null;
  onRemove: () => void;
}) {
  const context = sortContext(sort, piece, stats, now);
  return (
    <li className={`piece-card card${piece.pinned ? ' pinned' : ''}`} data-testid="piece-card">
      <button
        type="button"
        className="card-pin"
        aria-pressed={piece.pinned}
        aria-label={`${piece.pinned ? 'Unpin' : 'Pin'} ${piece.title}`}
        title={piece.pinned ? 'Unpin' : 'Pin to the top'}
        onClick={onPin}
      >
        {piece.pinned ? '★' : '☆'}
      </button>
      <Link href={`/piece/${piece.id}`} className="piece-link">
        <h3>{piece.title}</h3>
        {piece.artist && <p className="muted">{piece.artist}</p>}
        <div className="row piece-meta">
          {piece.scores.length > 0 && <span title="Scores">📄 {piece.scores.length}</span>}
          {piece.tracks.length > 0 && <span title="Backing tracks">🎧 {piece.tracks.length}</span>}
          {piece.targetBpm !== null && <span title="Target tempo">🎯 {piece.targetBpm}</span>}
        </div>
        {practiceKnown && (
          <p className="piece-practice" data-testid="piece-practice">
            {stats.lastPractisedAt === null
              ? '🌱 Not practised yet'
              : `🕘 Practised ${ago(stats.lastPractisedAt, now)} · ⏱ ${formatMinutes(stats.practisedSec)}`}
          </p>
        )}
        {context && (
          <p className="piece-when muted" data-testid="piece-when">
            {context}
          </p>
        )}
        {piece.tags.length > 0 && (
          <div className="row">
            {piece.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </Link>
      {setlist && (
        <div className="row card-actions">
          {onMove && (
            <>
              <button
                type="button"
                className="btn small icon"
                aria-label="Move up"
                onClick={() => {
                  onMove(-1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn small icon"
                aria-label="Move down"
                onClick={() => {
                  onMove(1);
                }}
              >
                ↓
              </button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="btn small ghost" onClick={onRemove}>
            Remove from setlist
          </button>
        </div>
      )}
    </li>
  );
}

function ContinueRow({ items, now }: { items: { piece: Piece; at: number }[]; now: number }) {
  if (items.length === 0) return null;
  return (
    <section className="library-continue" aria-label="Continue where you left off">
      <h2>Continue</h2>
      <ul className="library-continue-list">
        {items.map(({ piece, at }) => (
          <li key={piece.id}>
            <Link
              href={`/piece/${piece.id}`}
              className="library-continue-item"
              data-testid="continue-item"
            >
              <strong>{piece.title}</strong>
              <span className="muted">{ago(at, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LibraryPage() {
  const pieces = useAsync(() => api.listPieces(), 'pieces');
  const setlists = useAsync(() => api.getSetlists(), 'setlists');
  const sessions = useAsync(() => api.listSessions(), 'sessions');
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [setlistId, setSetlistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [libraryChoice, setLibraryChoice] = useState<SortChoice>(savedLibrarySort);
  const [setlistChoice, setSetlistChoice] = useState<{ sort: SortKey; reversed: boolean }>({
    sort: 'setlist',
    reversed: false,
  });
  const [resume] = useState(readResume);
  const [now] = useState(() => Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const selectSetlist = (id: string | null) => {
    setSetlistId(id);
    setSetlistChoice({ sort: 'setlist', reversed: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const lists = setlists.data?.setlists ?? [];
  const active = lists.find((s) => s.id === setlistId) ?? null;
  const saveSetlists = (next: Setlists) => {
    setlists.setData(() => next);
    void api.putSetlists(next).catch(() => {
      setlists.reload();
    });
  };
  const updateActive = (update: (s: Setlist) => Setlist) => {
    if (!active) return;
    saveSetlists({ setlists: lists.map((s) => (s.id === active.id ? update(s) : s)) });
  };

  const index = useMemo(() => (pieces.data ? buildPieceIndex(pieces.data) : null), [pieces.data]);
  const tagList = useMemo(() => (pieces.data ? allTags(pieces.data) : []), [pieces.data]);
  const stats = useMemo(
    () =>
      buildStats(pieces.data ?? [], sessions.data ?? [], (pieceId) =>
        lastOpenedAt(resume, pieceId),
      ),
    [pieces.data, sessions.data, resume],
  );
  const choice = active ? setlistChoice : libraryChoice;
  const searching = query.trim() !== '';
  const filtered =
    pieces.data && index
      ? filterPieces(pieces.data, { query, tags, pieceIds: active ? active.pieceIds : null }, index)
      : [];
  const shown = searching ? filtered : sortPieces(filtered, choice, stats);
  const continueItems =
    !active && !searching && tags.length === 0 ? recentlyOpened(pieces.data ?? [], stats, 4) : [];
  const sortOptions: readonly SortKey[] = active ? ['setlist', ...LIBRARY_SORTS] : LIBRARY_SORTS;

  const chooseSort = (next: { sort: SortKey; reversed: boolean }) => {
    console.info('dewidebug library sort chosen', { ...next, setlist: active?.id ?? null });
    if (active) {
      setSetlistChoice(next);
      return;
    }
    const parsed = LibrarySort.safeParse(next.sort);
    if (!parsed.success) return;
    const stored = { sort: parsed.data, reversed: next.reversed };
    setLibraryChoice(stored);
    rememberLibrarySort(stored);
  };

  const togglePin = (piece: Piece) => {
    const pinned = !piece.pinned;
    console.info('dewidebug library pin toggled', { id: piece.id, pinned });
    pieces.setData((list) => list?.map((p) => (p.id === piece.id ? { ...p, pinned } : p)));
    api.patchPiece(piece.id, { pinned }).then(
      (next) => {
        pieces.setData((list) => list?.map((p) => (p.id === next.id ? next : p)));
      },
      (e: unknown) => {
        console.warn('dewidebug library pin failed; reloading', { id: piece.id, error: String(e) });
        pieces.reload();
      },
    );
  };

  const pick = () => {
    const chosen = pickForMe(shown, stats, now);
    console.info('dewidebug library pick for me', {
      from: shown.length,
      chosen: chosen?.id ?? null,
    });
    if (chosen) navigate(`/piece/${chosen.id}`);
  };

  return (
    <div className="library">
      <aside className="setlists" aria-label="Setlists">
        <h2>Setlists</h2>
        <button
          type="button"
          className={`setlist-btn${setlistId === null ? ' on' : ''}`}
          onClick={() => {
            selectSetlist(null);
          }}
        >
          ✦ All pieces
        </button>
        {lists.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`setlist-btn${setlistId === s.id ? ' on' : ''}`}
            onClick={() => {
              selectSetlist(s.id);
            }}
          >
            {s.name} <span className="muted">({s.pieceIds.length})</span>
          </button>
        ))}
        <button
          type="button"
          className="btn small sun"
          data-testid="new-setlist"
          onClick={() => {
            const name = window.prompt('Setlist name', 'Warm-ups');
            if (!name?.trim()) return;
            const id = newId();
            saveSetlists({ setlists: [...lists, { id, name: name.trim(), pieceIds: [] }] });
            selectSetlist(id);
          }}
        >
          + New setlist
        </button>
        {active && (
          <div className="row">
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                const name = window.prompt('Rename setlist', active.name);
                if (name?.trim()) updateActive((s) => ({ ...s, name: name.trim() }));
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                if (!window.confirm(`Delete the setlist “${active.name}”? Pieces are kept.`))
                  return;
                saveSetlists({ setlists: lists.filter((s) => s.id !== active.id) });
                selectSetlist(null);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </aside>

      <main className="library-main">
        <div className="row library-head">
          <h1>{active ? active.name : 'Your library'}</h1>
          <span className="spacer" />
          <input
            ref={searchRef}
            className="input search"
            type="search"
            placeholder="Search…  ( / )"
            aria-label="Search pieces"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setCreating(true);
            }}
            data-testid="new-piece"
          >
            + New piece
          </button>
        </div>
        <ContinueRow items={continueItems} now={now} />
        <div className="row library-sort">
          <label className="row sort-field">
            <span>Sort</span>
            <select
              className="input"
              aria-label="Sort pieces"
              value={choice.sort}
              disabled={searching}
              onChange={(e) => {
                const sort = sortOptions.find((o) => o === e.target.value);
                if (sort) chooseSort({ sort, reversed: false });
              }}
            >
              {sortOptions.map((o) => (
                <option key={o} value={o}>
                  {SORT_LABELS[o]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn small ghost"
            aria-label="Reverse order"
            aria-pressed={choice.reversed}
            disabled={searching}
            onClick={() => {
              chooseSort({ sort: choice.sort, reversed: !choice.reversed });
            }}
          >
            {choice.reversed ? '↑ Reversed' : '↓ Reverse'}
          </button>
          {searching && <span className="muted">Best match first while searching</span>}
          <span className="spacer" />
          <button
            type="button"
            className="btn small sun"
            data-testid="pick-for-me"
            disabled={shown.length === 0}
            title="Open a piece at random, favouring ones you have not practised lately"
            onClick={pick}
          >
            🎲 Pick for me
          </button>
        </div>
        {tagList.length > 0 && (
          <div className="row tag-filter" aria-label="Filter by tag">
            {tagList.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                aria-pressed={tags.includes(t)}
                onClick={() => {
                  setTags((current) =>
                    current.includes(t) ? current.filter((x) => x !== t) : [...current, t],
                  );
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {pieces.error && <p className="error">{pieces.error}</p>}
        {pieces.loading && !pieces.data && <p className="muted">Loading your library…</p>}
        {pieces.data?.length === 0 && (
          <div className="empty-state card">
            <h2>Nothing here yet 🎸</h2>
            <p>
              Add your first piece: give it a title and drop in a PDF score or a MuseScore file.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setCreating(true);
              }}
            >
              + New piece
            </button>
          </div>
        )}
        {active?.pieceIds.length === 0 && (
          <p className="muted">
            This setlist is empty. Open a piece and tick this setlist to add it.
          </p>
        )}
        <ul className="piece-grid">
          {shown.map((piece) => (
            <PieceCard
              key={piece.id}
              piece={piece}
              stats={stats.get(piece.id) ?? NO_STATS}
              sort={choice.sort}
              now={now}
              practiceKnown={sessions.data !== undefined}
              setlist={active}
              onPin={() => {
                togglePin(piece);
              }}
              onMove={
                active && choice.sort === 'setlist' && !choice.reversed && !searching
                  ? (delta) => {
                      updateActive((s) => {
                        const ids = [...s.pieceIds];
                        const i = ids.indexOf(piece.id);
                        const j = i + delta;
                        if (i < 0 || j < 0 || j >= ids.length) return s;
                        [ids[i], ids[j]] = [ids[j] ?? piece.id, ids[i] ?? piece.id];
                        return { ...s, pieceIds: ids };
                      });
                    }
                  : null
              }
              onRemove={() => {
                updateActive((s) => ({
                  ...s,
                  pieceIds: s.pieceIds.filter((id) => id !== piece.id),
                }));
              }}
            />
          ))}
        </ul>
        {pieces.data && pieces.data.length > 0 && shown.length === 0 && !active && (
          <p className="muted">No pieces match.</p>
        )}
      </main>
      <NewPieceDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </div>
  );
}
