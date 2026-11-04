import {
  formatStars,
  parseCount,
  parseSourceUrl,
  parseStars,
  type Piece,
  type SourceEdit,
} from '@pcaa/shared';
import { useState, type SyntheticEvent } from 'react';
import { api } from '../api/client.ts';
import { ratingLine, strings, tips } from '../strings.ts';

interface Fields {
  url: string;
  stars: string;
  ratings: string;
  views: string;
}

function fieldsOf(source: Piece['source']): Fields {
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

function SourceBody({ piece, onSaved }: { piece: Piece; onSaved: (next: Piece) => void }) {
  const source = piece.source;
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Fields>(() => fieldsOf(source));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = () => {
    setFields(fieldsOf(source));
    setError(null);
    setEditing(true);
  };

  const send = async (patch: { source: SourceEdit | null }) => {
    setSaving(true);
    try {
      const next = await api.patchPiece(piece.id, patch);
      console.info('dewidebug piece source saved', {
        id: piece.id,
        source: next.source ? { name: next.source.name, rated: next.source.rating !== null } : null,
      });
      onSaved(next);
      setEditing(false);
    } catch (e) {
      console.warn('dewidebug piece source save failed', { id: piece.id, error: String(e) });
      setError(strings.source.saveFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const checked = check(fields);
    if ('error' in checked) {
      console.info('dewidebug piece source refused', { id: piece.id, why: checked.error });
      setError(checked.error);
      return;
    }
    setError(null);
    void send({ source: checked.edit });
  };

  const set = (key: keyof Fields) => (value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  if (editing) {
    return (
      <form
        className="source-form stack"
        aria-label={tips.source.form}
        data-testid="source-form"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
      >
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
          <button
            type="button"
            className="btn small ghost"
            disabled={saving}
            onClick={() => {
              setEditing(false);
            }}
          >
            {strings.source.cancel}
          </button>
          {source && (
            <button
              type="button"
              className="btn small ghost"
              disabled={saving}
              data-testid="source-remove"
              onClick={() => {
                if (window.confirm(strings.source.removeConfirm(source.name))) {
                  void send({ source: null });
                }
              }}
            >
              {strings.source.remove}
            </button>
          )}
        </div>
      </form>
    );
  }

  if (!source) {
    return (
      <button
        type="button"
        className="btn small ghost piece-source-add"
        data-testid="piece-source-add"
        title={tips.source.add}
        onClick={open}
      >
        {strings.source.add}
      </button>
    );
  }

  return (
    <span className="piece-source small-print" data-testid="piece-source">
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
        onClick={open}
      >
        {strings.source.edit}
      </button>
    </span>
  );
}

export function SourceLine(props: { piece: Piece; onSaved: (next: Piece) => void }) {
  return (
    <div className="piece-source-line">
      <SourceBody {...props} />
    </div>
  );
}
