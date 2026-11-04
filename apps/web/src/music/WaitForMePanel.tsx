import { useClaimedSurface, type DrawingSurface } from '../annotate/use-drawing.ts';
import { strings, tips } from '../strings.ts';
import { computerKeyRange } from './computer-keys.ts';
import { noteName } from './keys.ts';
import type { MidiStatus } from './midi-input.ts';
import type { WaitForMe } from './use-wait-for-me.ts';

function midiText(status: MidiStatus): string {
  switch (status.state) {
    case 'off':
      return '';
    case 'asking':
      return strings.playAlong.wait.midiAsking;
    case 'unsupported':
      return strings.playAlong.wait.midiUnsupported;
    case 'denied':
      return strings.playAlong.wait.midiDenied;
    case 'failed':
      return strings.playAlong.wait.midiFailed(status.error);
    case 'ready':
      return status.devices.length === 0
        ? strings.playAlong.wait.midiNone
        : strings.playAlong.wait.midiDevices(status.devices.join(', '));
  }
}

const seconds = (ms: number): number => Math.round(ms / 1000);

function keysText(claimed: DrawingSurface | null, from: string, to: string): string {
  if (claimed === 'score') return strings.playAlong.wait.keysOnScore;
  if (claimed !== null) return strings.playAlong.wait.keysDrawing;
  return strings.playAlong.wait.computerKeys(from, to);
}

export function WaitForMeBar({
  wait,
  playing,
  flats,
}: {
  wait: WaitForMe;
  playing: boolean;
  flats: boolean;
}) {
  const { stats } = wait;
  const claimed = useClaimedSurface();
  const [from, to] = computerKeyRange(wait.base);
  const now = wait.waiting
    ? strings.playAlong.wait.waitingFor(
        [...wait.expected].map((p) => noteName(p, flats)).join(' ') || '…',
      )
    : playing
      ? strings.playAlong.wait.playing
      : strings.playAlong.wait.ready;
  return (
    <div
      className="playalong-bar playalong-wait"
      title={tips.playAlong.waitInputs}
      data-testid="wait-panel"
      data-waiting={String(wait.waiting)}
      data-expected={[...wait.expected].join(' ')}
      data-played={[...wait.played].join(' ')}
      data-notes={stats.notes}
      data-right={stats.right}
      data-wrong={stats.wrong}
      data-finished={String(wait.finished)}
      data-midi={wait.midi.state}
      data-base={wait.base}
    >
      <strong className="wait-now" data-testid="wait-now">
        {now}
      </strong>
      <span className="muted small-print" data-testid="wait-live">
        {strings.playAlong.wait.live(
          stats.right,
          stats.notes,
          stats.wrong,
          seconds(stats.waitedMs),
        )}
      </span>
      <span className="spacer" />
      <span className="small-print" data-testid="wait-midi">
        {midiText(wait.midi)}
      </span>
      <span
        className="muted small-print"
        data-testid="wait-computer-keys"
        data-keys={claimed ?? 'piano'}
      >
        {keysText(claimed, noteName(from, flats), noteName(to, flats))}
      </span>
    </div>
  );
}

export function WaitResult({
  wait,
  playing,
  onAgain,
}: {
  wait: WaitForMe;
  playing: boolean;
  onAgain: () => void;
}) {
  const { stats } = wait;
  if (playing || stats.notes + stats.wrong === 0) return null;
  return (
    <div
      className="wait-result"
      role="status"
      aria-label={tips.playAlong.waitResult}
      title={tips.playAlong.waitResult}
      data-testid="wait-result"
      data-finished={String(wait.finished)}
    >
      <strong>
        {wait.finished ? strings.playAlong.wait.doneTitle : strings.playAlong.wait.soFarTitle}
      </strong>
      <span data-testid="wait-result-right">
        {strings.playAlong.wait.rightFirstTime(stats.right, stats.notes)}
      </span>
      <span data-testid="wait-result-wrong">{strings.playAlong.wait.wrongNotes(stats.wrong)}</span>
      <span data-testid="wait-result-waited">
        {strings.playAlong.wait.waited(seconds(stats.waitedMs))}
      </span>
      <button type="button" className="btn small" data-testid="wait-again" onClick={onAgain}>
        {strings.playAlong.wait.again}
      </button>
    </div>
  );
}
