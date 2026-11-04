import {
  formatStars,
  parseCount,
  parseSourceUrl,
  parseStars,
  type FileName,
  type Piece,
  type PieceSource,
  type SourceEdit,
} from '@pcaa/shared';
import { useState, type SyntheticEvent } from 'react';
import { api } from '../api/client.ts';
import { filesOf, patchFor, sourceOf, WHOLE_PIECE, type Target } from './source-targets.ts';
import { ratingLine, strings, tips } from '../strings.ts';

interface Fields {
  url: string;
  stars: string;
  ratings: string;
  views: string;
}

function fieldsOf(source: PieceSource | undefined): Fields {
  return {
    url: source?.url ?? '',
    stars:
      source?.rating?.stars === null || source?.rating?.stars === undefined
        ? ''
        : formatStars(source.rating.stars),
    ratings: String(source?.rating?.ratings ?? ''),
    views: String(source?.rating?.views ?? ''),
  };
}

type Checked = { edit: SourceEdit } | { error: string };

function check(fields: Fields): Checked {
  const url = parseSourceUrl(fields.url);
  if (url === null) return { error: strings.source.badLink };
  const stars = fields.stars.trim() === '' ? null : parseStars(fields.stars);
  if (fields.stars.trim() !== '' && stars === null) return { error: strings.source.badStars };
  const counts: (number | null)[] = [];
  for (const [text, label] of [
    [fields.ratings, strings.source.ratingsLabel],
    [fields.views, strings.source.viewsLabel],
  ] as const) {
    const count = text.trim() === '' ? null : parseCount(text);
    if (text.trim() !== '' && count === null) return { error: strings.source.badCount(label) };
    counts.push(count);
  }
  const [ratings = null, views = null] = counts;
  const rating =
    stars === null && ratings === null && views === null ? null : { stars, ratings, views };
  return { edit: { url, rating } };
}

function Field({
  label,
  testId,
  value,
  placeholder,
  wide,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`source-field${wide ? ' source-field-wide' : ''}`}>
      <span className="small-print">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function SourceForm({
  piece,
  initial,
  onClose,
  onSaved,
}: {
  piece: Piece;
  initial: Target;
  onClose: () => void;
  onSaved: (next: Piece) => void;
}) {
  const files = filesOf(piece);
  const [target, setTarget] = useState<Target>(initial);
  const source = sourceOf(piece, target);
  const [fields, setFields] = useState<Fields>(() => fieldsOf(sourceOf(piece, initial)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const choose = (next: Target) => {
    console.info('dewidebug source form target', { id: piece.id, target: next });
    setTarget(next);
    setFields(fieldsOf(sourceOf(piece, next)));
    setError(null);
  };

  const send = async (edit: SourceEdit | null) => {
    setSaving(true);
    try {
      const next = await api.patchPiece(piece.id, patchFor(target, edit));
      const saved = sourceOf(next, target);
      console.info('dewidebug source saved', {
        id: piece.id,
        target,
        source: saved ? { name: saved.name, rated: saved.rating !== null } : null,
      });
      onSaved(next);
      onClose();
    } catch (e) {
      console.warn('dewidebug source save failed', { id: piece.id, target, error: String(e) });
      setError(strings.source.saveFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const checked = check(fields);
    if ('error' in checked) {
      console.info('dewidebug source refused', { id: piece.id, target, why: checked.error });
      setError(checked.error);
      return;
    }
    setError(null);
    void send(checked.edit);
  };

  const set = (key: keyof Fields) => (value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  const targetName =
    target === WHOLE_PIECE ? null : (files.find((f) => f.file === target)?.name ?? target);

  return (
    <form
      className="source-form stack"
      aria-label={tips.source.form}
      data-testid="source-form"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      {files.length > 0 && (
        <label className="row source-for">
          <span className="small-print">{strings.source.forLabel}</span>
          <select
            className="input source-for-select"
            aria-label={tips.source.forTarget}
            data-testid="source-for"
            value={target}
            onChange={(e) => {
              const chosen = e.target.value;
              choose(
                chosen === WHOLE_PIECE
                  ? WHOLE_PIECE
                  : (files.find((f) => f.file === chosen)?.file ?? WHOLE_PIECE),
              );
            }}
          >
            <option value={WHOLE_PIECE}>{strings.source.forPiece}</option>
            {files.map((f) => (
              <option key={f.file} value={f.file}>
                {strings.source.forFile[f.kind](f.name)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row source-fields">
        <Field
          label={strings.source.urlLabel}
          testId="source-url"
          value={fields.url}
          placeholder={tips.source.urlPlaceholder}
          wide
          onChange={set('url')}
        />
        <Field
          label={strings.source.starsLabel}
          testId="source-stars"
          value={fields.stars}
          placeholder={tips.source.starsPlaceholder}
          onChange={set('stars')}
        />
        <Field
          label={strings.source.ratingsLabel}
          testId="source-ratings"
          value={fields.ratings}
          placeholder={tips.source.ratingsPlaceholder}
          onChange={set('ratings')}
        />
        <Field
          label={strings.source.viewsLabel}
          testId="source-views"
          value={fields.views}
          placeholder={tips.source.viewsPlaceholder}
          onChange={set('views')}
        />
      </div>
      <p className="muted small-print">{strings.source.hint}</p>
      {error && (
        <p className="error" data-testid="source-error">
          {error}
        </p>
      )}
      <div className="row">
        <button
          type="submit"
          className="btn small primary"
          disabled={saving}
          data-testid="source-save"
        >
          {saving ? strings.source.saving : strings.source.save}
        </button>
        <button type="button" className="btn small ghost" disabled={saving} onClick={onClose}>
          {strings.source.cancel}
        </button>
        {source && (
          <button
            type="button"
            className="btn small ghost"
            disabled={saving}
            data-testid="source-remove"
            onClick={() => {
              const question =
                targetName === null
                  ? strings.source.removeConfirm(source.name)
                  : strings.source.removeFileConfirm(source.name, targetName);
              if (window.confirm(question)) void send(null);
            }}
          >
            {strings.source.remove}
          </button>
        )}
      </div>
    </form>
  );
}

function SourceShow({
  source,
  label,
  testId,
  file,
  onEdit,
}: {
  source: PieceSource;
  label?: string;
  testId: string;
  file?: FileName;
  onEdit: () => void;
}) {
  return (
    <span className="piece-source small-print" data-testid={testId} data-file={file}>
      {label && <span className="piece-source-file">{label}</span>}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        title={tips.source.open}
        data-testid="piece-source-link"
      >
        {strings.find.fromSite(source.name)}
      </a>
      {source.licence !== null &&
        (source.licenceUrl ? (
          <a href={source.licenceUrl} target="_blank" rel="noreferrer">
            {strings.find.attribution(source.licence)}
          </a>
        ) : (
          <span>{strings.find.attribution(source.licence)}</span>
        ))}
      {source.rating && <span data-testid="piece-source-rating">{ratingLine(source.rating)}</span>}
      <button
        type="button"
        className="btn small ghost"
        data-testid="piece-source-edit"
        title={tips.source.edit}
        onClick={onEdit}
      >
        {strings.source.edit}
      </button>
    </span>
  );
}

export function SourceLine({ piece, onSaved }: { piece: Piece; onSaved: (next: Piece) => void }) {
  const [editing, setEditing] = useState<Target | null>(null);
  const own = filesOf(piece).filter((f) => f.source !== undefined);

  if (editing !== null) {
    return (
      <div className="piece-source-line">
        <SourceForm
          piece={piece}
          initial={editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      </div>
    );
  }

  return (
    <div className="piece-source-line stack">
      {piece.source ? (
        <SourceShow
          source={piece.source}
          testId="piece-source"
          onEdit={() => {
            setEditing(WHOLE_PIECE);
          }}
        />
      ) : (
        <button
          type="button"
          className="btn small ghost piece-source-add"
          data-testid="piece-source-add"
          title={tips.source.add}
          onClick={() => {
            setEditing(WHOLE_PIECE);
          }}
        >
          {strings.source.add}
        </button>
      )}
      {own.map((f) =>
        f.source ? (
          <SourceShow
            key={f.file}
            source={f.source}
            label={strings.source.fileLabel[f.kind](f.name)}
            testId="file-source"
            file={f.file}
            onEdit={() => {
              setEditing(f.file);
            }}
          />
        ) : null,
      )}
    </div>
  );
}
