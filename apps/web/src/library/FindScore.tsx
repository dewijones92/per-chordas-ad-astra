import { startInLearnKey } from '../music/learn-key.ts';
import { type FindImportResponse, type FindSearchResponse, type FoundScore } from '@pcaa/shared';
import { useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { checkFile } from '../music/file-check.ts';
import { FileCheckLine } from '../music/FileCheckLine.tsx';
import '../music/music.css';
import { strings, tips } from '../strings.ts';
import { useAsync } from '../ui/use-async.ts';
import { byline, formatChip, importSummary, musicToCheck } from './find-view.ts';

type Search =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'failed'; message: string }
  | { phase: 'done'; response: FindSearchResponse };

type Import =
  | { phase: 'idle' }
  | { phase: 'importing' }
  | { phase: 'failed'; message: string }
  | { phase: 'done'; result: FindImportResponse };

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function FoundFileCheck({ url }: { url: string }) {
  const check = useAsync(async () => {
    const bytes = await api.findMusic(url);
    const { readScore } = await import('../music/load.ts');
    const result = checkFile(readScore(bytes).score);
    console.info('dewidebug find file checked', { url, bytes: bytes.byteLength, ...result });
    return result;
  }, `find-check:${url}`);
  if (check.error) {
    return (
      <p className="error" data-testid="find-check-error">
        {strings.find.checkFailed(check.error)}
      </p>
    );
  }
  if (!check.data) {
    return (
      <p className="muted" data-testid="find-checking">
        {strings.find.checking}
      </p>
    );
  }
  return (
    <div className="find-check" data-testid="find-checked">
      <span>{strings.find.checked}</span>
      <FileCheckLine check={check.data} />
    </div>
  );
}

function Licence({ result }: { result: FoundScore }) {
  const text = strings.find.licence(result.licence);
  return result.licenceUrl ? (
    <a href={result.licenceUrl} target="_blank" rel="noreferrer" title={tips.find.licence}>
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );
}

function ResultRow({
  result,
  onChoose,
}: {
  result: FoundScore;
  onChoose?: (result: FoundScore) => void;
}) {
  const line = byline(result);
  return (
    <li className="find-result" data-testid="find-result" data-id={result.id}>
      <div className="find-result-main">
        <strong>{result.title}</strong>
        {line && <span className="muted">{line}</span>}
        <span className="row find-result-facts">
          <span className="tag">{result.sourceName}</span>
          <Licence result={result} />
          {result.files.map((file) => (
            <span key={file.url} className="chip find-format">
              {formatChip(file)}
            </span>
          ))}
          <a href={result.pageUrl} target="_blank" rel="noreferrer" title={tips.find.sourcePage}>
            {strings.find.sourcePage}
          </a>
        </span>
      </div>
      {onChoose && (
        <button
          type="button"
          className="btn small sun"
          data-testid="find-choose"
          onClick={() => {
            onChoose(result);
          }}
        >
          {strings.find.choose}
        </button>
      )}
    </li>
  );
}

export function FindScore({
  learnKey,
  onImported,
}: {
  learnKey: boolean;
  onImported: (pieceId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ phase: 'idle' });
  const [chosen, setChosen] = useState<FoundScore | null>(null);
  const [imported, setImported] = useState<Import>({ phase: 'idle' });
  const asked = useRef(0);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++asked.current;
    console.info('dewidebug find search asked', { query: q });
    setSearch({ phase: 'searching' });
    setChosen(null);
    setImported({ phase: 'idle' });
    try {
      const response = await api.findScores(q);
      if (ticket !== asked.current) return;
      console.info('dewidebug find search answered', {
        query: q,
        results: response.results.length,
        sources: response.sources.map((s) => ({ source: s.source, ok: s.ok, count: s.count })),
      });
      setSearch({ phase: 'done', response });
    } catch (e) {
      if (ticket !== asked.current) return;
      console.warn('dewidebug find search failed', { query: q, error: errorText(e) });
      setSearch({ phase: 'failed', message: errorText(e) });
    }
  };

  const choose = (result: FoundScore | null) => {
    console.info('dewidebug find result chosen', { id: result?.id ?? null });
    setChosen(result);
    setImported({ phase: 'idle' });
  };

  const runImport = async (result: FoundScore) => {
    console.info('dewidebug find import asked', { id: result.id, summary: importSummary(result) });
    setImported({ phase: 'importing' });
    try {
      const done = await api.importFound(result);
      console.info('dewidebug find import done', {
        id: done.piece.id,
        imported: done.imported,
        skipped: done.skipped,
      });
      const music = musicToCheck(result);
      const added = done.piece.music[0];
      if (learnKey && music && added) {
        await startInLearnKey(done.piece.id, added.file, await api.findMusic(music.url));
      }
      if (done.skipped.length === 0) onImported(done.piece.id);
      else setImported({ phase: 'done', result: done });
    } catch (e) {
      console.warn('dewidebug find import failed', { id: result.id, error: errorText(e) });
      setImported({ phase: 'failed', message: errorText(e) });
    }
  };

  const response = search.phase === 'done' ? search.response : null;
  const music = chosen ? musicToCheck(chosen) : null;
  const importing = imported.phase === 'importing';

  return (
    <details className="find-panel" data-testid="find-panel">
      <summary>{strings.find.summary}</summary>
      <div className="stack">
        <p className="muted small-print">{strings.find.intro}</p>
        <div className="row">
          <input
            className="input find-query"
            type="search"
            value={query}
            placeholder={tips.find.placeholder}
            aria-label={tips.find.searchLabel}
            data-testid="find-query"
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              void runSearch();
            }}
          />
          <button
            type="button"
            className="btn primary"
            data-testid="find-search"
            disabled={query.trim().length < 2 || search.phase === 'searching'}
            onClick={() => {
              void runSearch();
            }}
          >
            {search.phase === 'searching' ? strings.find.searching : strings.find.search}
          </button>
        </div>
        {search.phase === 'failed' && (
          <p className="error" data-testid="find-failed">
            {strings.find.failed(search.message)}
          </p>
        )}
        {response && (
          <div className="stack" data-testid="find-answer">
            <p data-testid="find-count">
              {response.results.length === 0
                ? strings.find.nothingFound
                : strings.find.found(response.results.length)}
            </p>
            {response.sources
              .filter((s) => !s.ok)
              .map((s) => (
                <p key={s.source} className="error" data-testid="find-site-failed">
                  {strings.find.siteFailed(s.name, s.error ?? '')}
                </p>
              ))}
            {response.sources
              .filter((s) => s.hidden > 0)
              .map((s) => (
                <p key={s.source} className="muted small-print">
                  {strings.find.siteHidden(s.name, s.hidden)}
                </p>
              ))}
            {!chosen && (
              <ul className="find-results" aria-label={tips.find.results}>
                {response.results.map((r) => (
                  <ResultRow key={r.id} result={r} onChoose={choose} />
                ))}
              </ul>
            )}
          </div>
        )}
        {chosen && (
          <div className="stack find-chosen" data-testid="find-chosen">
            <button
              type="button"
              className="btn small ghost"
              disabled={importing}
              onClick={() => {
                choose(null);
              }}
            >
              {strings.find.chosen}
            </button>
            <ResultRow result={chosen} />
            {music ? (
              <FoundFileCheck key={music.url} url={music.url} />
            ) : (
              <p className="muted" data-testid="find-no-music">
                {strings.find.noMusic}
              </p>
            )}
            <p className="small-print">{strings.find.willImport(importSummary(chosen))}</p>
            {imported.phase === 'failed' && (
              <p className="error" data-testid="find-import-failed">
                {strings.find.importFailed(imported.message)}
              </p>
            )}
            {imported.phase === 'done' ? (
              <div className="stack" data-testid="find-imported">
                <p>{strings.find.imported(imported.result.piece.title)}</p>
                {imported.result.skipped.map((s) => (
                  <p key={s.label} className="error">
                    {strings.find.skipped(s.label, s.reason)}
                  </p>
                ))}
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onImported(imported.result.piece.id);
                  }}
                >
                  {strings.find.open}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn primary"
                data-testid="find-import"
                disabled={importing}
                onClick={() => {
                  void runImport(chosen);
                }}
              >
                {importing ? strings.find.importing : strings.find.import}
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
