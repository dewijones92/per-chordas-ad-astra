import { emptyResume, mergeResume, ResumeState } from '@pcaa/shared';
import type { Logger } from '../log.ts';
import { SOLE_USER, type Person } from '../person.ts';
import { readJson, resolveInside, writeJson } from './files.ts';

export const STATE_DIR = '.state';

export class ResumeStore {
  private readonly dataDir: string;
  private readonly tmp: string;
  private readonly log: Logger;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string, log: Logger) {
    this.dataDir = dataDir;
    this.tmp = resolveInside(dataDir, STATE_DIR, 'tmp');
    this.log = log.child({ component: 'resume' });
  }

  private pathFor(person: Person): string {
    const name = person.owner || person.key === null ? 'resume.json' : `resume-${person.key}.json`;
    return resolveInside(this.dataDir, STATE_DIR, name);
  }

  async get(person: Person = SOLE_USER): Promise<ResumeState> {
    try {
      return await readJson(this.pathFor(person), ResumeState, emptyResume);
    } catch (error) {
      this.log.warn({ err: error }, 'dewidebug resume state unreadable, starting fresh');
      return emptyResume();
    }
  }

  merge(input: unknown, person: Person = SOLE_USER): Promise<ResumeState> {
    const incoming = ResumeState.parse(input);
    const run = this.chain.then(async () => {
      const merged = mergeResume(await this.get(person), incoming);
      await writeJson(this.pathFor(person), merged, this.tmp);
      this.log.debug(
        {
          person: person.key,
          owner: person.owner,
          lastPath: merged.lastPath?.path,
          scores: Object.keys(merged.scores).length,
        },
        'dewidebug resume state merged',
      );
      return merged;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
