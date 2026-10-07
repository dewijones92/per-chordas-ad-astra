import { emptyResume, mergeResume, ResumeState } from '@pcaa/shared';
import type { Logger } from '../log.ts';
import { readJson, resolveInside, writeJson } from './files.ts';

export const STATE_DIR = '.state';

export class ResumeStore {
  private readonly path: string;
  private readonly tmp: string;
  private readonly log: Logger;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string, log: Logger) {
    this.path = resolveInside(dataDir, STATE_DIR, 'resume.json');
    this.tmp = resolveInside(dataDir, STATE_DIR, 'tmp');
    this.log = log.child({ component: 'resume' });
  }

  async get(): Promise<ResumeState> {
    try {
      return await readJson(this.path, ResumeState, emptyResume);
    } catch (error) {
      this.log.warn({ err: error }, 'dewidebug resume state unreadable, starting fresh');
      return emptyResume();
    }
  }

  merge(input: unknown): Promise<ResumeState> {
    const incoming = ResumeState.parse(input);
    const run = this.chain.then(async () => {
      const merged = mergeResume(await this.get(), incoming);
      await writeJson(this.path, merged, this.tmp);
      this.log.debug(
        { lastPath: merged.lastPath?.path, scores: Object.keys(merged.scores).length },
        'dewidebug resume state merged',
      );
      return merged;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
