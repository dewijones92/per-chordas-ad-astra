import { newId, type Piece, type Setlist, type Setlists } from '@pcaa/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { api } from '../api/client.ts';
import { useAsync } from '../ui/use-async.ts';
import { allTags, filterPieces } from './search.ts';
import './library.css';

function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function NewPieceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [, navigate] = useLocation();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const piece = await api.createPiece({ title, artist, tags: parseTags(tags) });
      if (file) await api.uploadScore(piece.id, file);
      navigate(`/piece/${piece.id}`);
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
            accept="application/pdf,.pdf"
            name="score"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        {error && <p className="error">{error}</p>}
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

function PieceCard({
  piece,
  setlist,
  onMove,
  onRemove,
}: {
  piece: Piece;
  setlist: Setlist | null;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className="piece-card card" data-testid="piece-card">
      <Link href={`/piece/${piece.id}`} className="piece-link">
        <h3>{piece.title}</h3>
        {piece.artist && <p className="muted">{piece.artist}</p>}
        <div className="row piece-meta">
          {piece.scores.length > 0 && <span title="Scores">📄 {piece.scores.length}</span>}
          {piece.tracks.length > 0 && <span title="Backing tracks">🎧 {piece.tracks.length}</span>}
          {piece.targetBpm !== null && <span title="Target tempo">🎯 {piece.targetBpm}</span>}
        </div>
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
          <span className="spacer" />
          <button type="button" className="btn small ghost" onClick={onRemove}>
            Remove from setlist
          </button>
        </div>
      )}
    </li>
  );
}

export function LibraryPage() {
  const pieces = useAsync(() => api.listPieces(), 'pieces');
  const setlists = useAsync(() => api.getSetlists(), 'setlists');
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [setlistId, setSetlistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const shown = pieces.data
    ? filterPieces(pieces.data, { query, tags, pieceIds: active ? active.pieceIds : null })
    : [];

  return (
    <div className="library">
      <aside className="setlists" aria-label="Setlists">
        <h2>Setlists</h2>
        <button
          type="button"
          className={`setlist-btn${setlistId === null ? ' on' : ''}`}
          onClick={() => {
            setSetlistId(null);
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
              setSetlistId(s.id);
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
            setSetlistId(id);
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
                setSetlistId(null);
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
        {pieces.data && allTags(pieces.data).length > 0 && (
          <div className="row tag-filter" aria-label="Filter by tag">
            {allTags(pieces.data).map((t) => (
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
            <p>Add your first piece: give it a title and drop in a PDF score.</p>
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
              setlist={active}
              onMove={(delta) => {
                updateActive((s) => {
                  const ids = [...s.pieceIds];
                  const i = ids.indexOf(piece.id);
                  const j = i + delta;
                  if (i < 0 || j < 0 || j >= ids.length) return s;
                  [ids[i], ids[j]] = [ids[j] ?? piece.id, ids[i] ?? piece.id];
                  return { ...s, pieceIds: ids };
                });
              }}
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
