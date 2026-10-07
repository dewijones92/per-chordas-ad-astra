import { PitchDetector } from 'pitchy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { median } from './notes.ts';

const FFT_SIZE = 4096;
const MIN_CLARITY = 0.9;
const MIN_HZ = 40;
const MAX_HZ = 1400;
const SMOOTHING = 5;

export interface TunerState {
  listening: boolean;
  hz: number | null;
  clarity: number;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useTuner(): TunerState {
  const [listening, setListening] = useState(false);
  const [hz, setHz] = useState<number | null>(null);
  const [clarity, setClarity] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const teardown = useRef<(() => void) | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    starting.current = false;
    teardown.current?.();
    teardown.current = null;
    setListening(false);
    setHz(null);
  }, []);

  const start = useCallback(() => {
    if (teardown.current || starting.current) {
      console.info('dewidebug tuner start ignored: already starting or running');
      return;
    }
    starting.current = true;
    const mine = ++generation.current;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      .then((stream) => {
        starting.current = false;
        if (mine !== generation.current) {
          stream.getTracks().forEach((t) => {
            t.stop();
          });
          console.info('dewidebug tuner stopped before the microphone opened; released it');
          return;
        }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source.connect(analyser);
        const detector = PitchDetector.forFloat32Array(analyser.fftSize);
        detector.minVolumeDecibels = -45;
        const buffer = new Float32Array(analyser.fftSize);
        const recent: number[] = [];
        let frame = 0;
        let silentFrames = 0;
        const warmUntil = ctx.currentTime + (2 * FFT_SIZE) / ctx.sampleRate;
        const loop = () => {
          if (ctx.currentTime < warmUntil) {
            frame = requestAnimationFrame(loop);
            return;
          }
          analyser.getFloatTimeDomainData(buffer);
          const [pitch, quality] = detector.findPitch(buffer, ctx.sampleRate);
          if (quality >= MIN_CLARITY && pitch >= MIN_HZ && pitch <= MAX_HZ) {
            recent.push(pitch);
            if (recent.length > SMOOTHING) recent.shift();
            setHz(median(recent));
            setClarity(quality);
            silentFrames = 0;
          } else if (++silentFrames > 30) {
            recent.length = 0;
            setHz(null);
            setClarity(quality);
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        console.info('dewidebug tuner listening', { sampleRate: ctx.sampleRate, fft: FFT_SIZE });
        teardown.current = () => {
          cancelAnimationFrame(frame);
          stream.getTracks().forEach((t) => {
            t.stop();
          });
          void ctx.close();
          console.info('dewidebug tuner stopped');
        };
        setListening(true);
      })
      .catch((e: unknown) => {
        starting.current = false;
        const message = e instanceof Error ? e.message : String(e);
        console.warn('dewidebug tuner microphone refused', { message });
        setError(`Microphone unavailable: ${message}`);
      });
  }, []);

  useEffect(() => stop, [stop]);

  return { listening, hz, clarity, error, start, stop };
}
