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
const accuracyPercent = (accuracy: number, judged: number): number =>
  judged === 0 ? 100 : Math.round(accuracy * 100);

function keysText(claimed: DrawingSurface | null, from: string, to: string): string {
  if (claimed === 'score') return strings.playAlong.wait.keysOnScore;
  if (claimed !== null) return strings.playAlong.wait.keysDrawing;
  return strings.playAlong.wait.computerKeys(from, to);
}

function MidiControls({
  wait,
  midiSound,
  midiDevice,
  onMidiSound,
  onMidiDevice,
}: {
  wait: WaitForMe;
  midiSound: boolean;
  midiDevice: string | null;
  onMidiSound: (on: boolean) => void;
  onMidiDevice: (deviceId: string | null) => void;
}) {
  const activeDevice =
    midiDevice !== null && wait.ports.some((p) => p.id === midiDevice) ? midiDevice : '';
  return (
    <>
      <span className="small-print" data-testid="wait-midi">
        {midiText(wait.midi)}
      </span>
      {wait.ports.length > 1 && (
        <select
          className="midi-device-select"
          value={activeDevice}
          aria-label={tips.playAlong.midiDevice}
          title={tips.playAlong.midiDevice}
          data-testid="midi-device-select"
          onChange={(e) => {
            onMidiDevice(e.target.value === '' ? null : e.target.value);
          }}
        >
          <option value="">{strings.playAlong.midiAllDevices}</option>
          {wait.ports.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name}
            </option>
          ))}
        </select>
      )}
      {wait.sustained && (
        <span
          className="midi-sustain-pill"
          title={tips.playAlong.midiSustain}
          data-testid="midi-sustain"
        >
          {strings.playAlong.midiSustain}
        </span>
      )}
      <button
        type="button"
        className="btn small ghost"
        aria-pressed={midiSound}
        title={tips.playAlong.midiSound}
        data-testid="midi-sound-toggle"
        onClick={() => {
          onMidiSound(!midiSound);
        }}
      >
        {midiSound ? strings.playAlong.midiSoundOn : strings.playAlong.midiSoundOff}
      </button>
    </>
  );
}

export function MidiStatusBar({
  wait,
  midiSound,
  midiDevice,
  onMidiSound,
  onMidiDevice,
}: {
  wait: WaitForMe;
  midiSound: boolean;
  midiDevice: string | null;
  onMidiSound: (on: boolean) => void;
  onMidiDevice: (deviceId: string | null) => void;
}) {
  if (wait.ports.length === 0) return null;
  return (
    <div
      className="playalong-bar playalong-midi-bar"
      title={tips.playAlong.waitInputs}
      data-testid="midi-bar"
      data-midi={wait.midi.state}
      data-sustain={String(wait.sustained)}
      data-played={[...wait.played].join(' ')}
    >
      <MidiControls
        wait={wait}
        midiSound={midiSound}
        midiDevice={midiDevice}
        onMidiSound={onMidiSound}
        onMidiDevice={onMidiDevice}
      />
    </div>
  );
}

export function WaitForMeBar({
  wait,
  playing,
  flats,
  midiSound,
  midiDevice,
  onMidiSound,
  onMidiDevice,
}: {
  wait: WaitForMe;
  playing: boolean;
  flats: boolean;
  midiSound: boolean;
  midiDevice: string | null;
  onMidiSound: (on: boolean) => void;
  onMidiDevice: (deviceId: string | null) => void;
}) {
  const claimed = useClaimedSurface();
  const [from, to] = computerKeyRange(wait.base);
  if (wait.mode === 'rhythm') {
    const { rhythmStats: r } = wait;
    const judged = r.notes + r.wrong;
    const accuracy = accuracyPercent(r.accuracy, judged);
    const now =
      wait.lastGrade !== null
        ? strings.playAlong.rhythmBar.grade[wait.lastGrade]
        : playing
          ? strings.playAlong.rhythmBar.playing
          : strings.playAlong.rhythmBar.ready;
    return (
      <div
        className="playalong-bar playalong-wait playalong-rhythm"
        title={tips.playAlong.waitInputs}
        data-testid="rhythm-panel"
        data-played={[...wait.played].join(' ')}
        data-notes={r.notes}
        data-perfect={r.perfect}
        data-good={r.good}
        data-missed={r.missed}
        data-wrong={r.wrong}
        data-streak={r.streak}
        data-best-streak={r.bestStreak}
        data-accuracy={accuracy}
        data-grade={wait.lastGrade ?? ''}
        data-finished={String(wait.finished)}
        data-midi={wait.midi.state}
        data-sustain={String(wait.sustained)}
        data-base={wait.base}
      >
        <strong className="wait-now" data-testid="rhythm-now">
          {now}
        </strong>
        <span className="muted small-print" data-testid="rhythm-live">
          {strings.playAlong.rhythmBar.live(accuracy, r.streak, r.perfect, r.good, r.missed)}
        </span>
        <span className="spacer" />
        <MidiControls
          wait={wait}
          midiSound={midiSound}
          midiDevice={midiDevice}
          onMidiSound={onMidiSound}
          onMidiDevice={onMidiDevice}
        />
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
  const { stats } = wait;
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
      data-sustain={String(wait.sustained)}
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
      <MidiControls
        wait={wait}
        midiSound={midiSound}
        midiDevice={midiDevice}
        onMidiSound={onMidiSound}
        onMidiDevice={onMidiDevice}
      />
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
  if (wait.mode === 'rhythm') {
    const { rhythmStats: r } = wait;
    const judged = r.notes + r.wrong;
    if (playing || judged === 0) return null;
    const accuracy = accuracyPercent(r.accuracy, judged);
    return (
      <div
        className="wait-result"
        role="status"
        aria-label={tips.playAlong.rhythmResult}
        title={tips.playAlong.rhythmResult}
        data-testid="rhythm-result"
        data-finished={String(wait.finished)}
        data-accuracy={accuracy}
      >
        <strong>
          {wait.finished ? strings.playAlong.wait.doneTitle : strings.playAlong.wait.soFarTitle}
        </strong>
        <span data-testid="rhythm-result-accuracy">
          {strings.playAlong.rhythmBar.accuracy(accuracy)}
        </span>
        <span data-testid="rhythm-result-hits">
          {strings.playAlong.rhythmBar.hits(r.perfect, r.good)}
        </span>
        <span data-testid="rhythm-result-streak">
          {strings.playAlong.rhythmBar.bestStreak(r.bestStreak)}
        </span>
        <span data-testid="rhythm-result-misses">
          {strings.playAlong.rhythmBar.misses(r.missed, r.wrong)}
        </span>
        <button type="button" className="btn small" data-testid="wait-again" onClick={onAgain}>
          {strings.playAlong.wait.again}
        </button>
      </div>
    );
  }
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
