import type { FileFingering, Fingering } from '@pcaa/shared';

type Notes = FileFingering['notes'];

export class FingerSaves {
  private issued = 0;
  private newest = 0;
  private pending = 0;
  private confirmed: Fingering | undefined;

  begin(shown: Fingering | undefined): number {
    if (this.pending === 0) this.confirmed = shown;
    this.pending++;
    return ++this.issued;
  }

  succeeded(ticket: number, file: string, notes: Notes): Fingering | null {
    if (ticket > this.newest) {
      this.newest = ticket;
      this.confirmed = { files: { ...(this.confirmed?.files ?? {}), [file]: notes } };
    }
    return this.settle();
  }

  failed(): Fingering | null {
    return this.settle();
  }

  private settle(): Fingering | null {
    this.pending = Math.max(0, this.pending - 1);
    return this.pending === 0 ? (this.confirmed ?? null) : null;
  }
}
