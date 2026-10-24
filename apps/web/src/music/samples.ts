import { z } from 'zod';

export const SampleManifest = z.object({
  name: z.string(),
  author: z.string(),
  licence: z.string(),
  pitches: z.array(z.int()).min(1),
  layers: z.array(z.object({ name: z.string().min(1), velocity: z.int().min(1).max(127) })).min(1),
  file: z.string().includes('{pitch}').includes('{layer}'),
});
export type SampleManifest = z.infer<typeof SampleManifest>;

export interface SampleChoice {
  pitch: number;
  layer: string;
  rate: number;
}

export function chooseSample(
  manifest: SampleManifest,
  pitch: number,
  velocity: number,
): SampleChoice {
  let nearest = manifest.pitches[0] ?? pitch;
  for (const p of manifest.pitches)
    if (Math.abs(p - pitch) < Math.abs(nearest - pitch)) nearest = p;
  let layer = manifest.layers[0]?.name ?? '';
  let best = Infinity;
  for (const l of manifest.layers) {
    const distance = Math.abs(l.velocity - velocity);
    if (distance < best) {
      best = distance;
      layer = l.name;
    }
  }
  return { pitch: nearest, layer, rate: 2 ** ((pitch - nearest) / 12) };
}

export function sampleFile(manifest: SampleManifest, pitch: number, layer: string): string {
  return manifest.file.replace('{pitch}', String(pitch)).replace('{layer}', layer);
}

export function gainFor(velocity: number): number {
  const v = Math.min(127, Math.max(1, velocity)) / 127;
  return 0.25 + 0.75 * v * v;
}
