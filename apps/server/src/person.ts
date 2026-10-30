import { personFromEmail, type HardBit, type PersonKey } from '@pcaa/shared';

export const PERSON_HEADER = 'x-forwarded-email';

export interface Person {
  key: PersonKey | null;
  owner: boolean;
  stamp: PersonKey | undefined;
  owns: (who: PersonKey | undefined) => boolean;
}

export function personOf(email: string | undefined, ownerKey: string): Person {
  const key = personFromEmail(email);
  if (ownerKey === '') return { key, owner: true, stamp: undefined, owns: () => true };
  if (key === null || key === ownerKey) {
    return {
      key,
      owner: true,
      stamp: undefined,
      owns: (who) => who === undefined || who === ownerKey,
    };
  }
  return { key, owner: false, stamp: key, owns: (who) => who === key };
}

export const SOLE_USER: Person = personOf(undefined, '');

export function hardBitsFor(person: Person, bits: readonly HardBit[]): HardBit[] {
  return bits.map(({ best, ...bit }) =>
    person.owner || person.key === null ? bit : { ...bit, bestSpeed: best?.[person.key] ?? 0 },
  );
}

export function bestFor(person: Person, bit: HardBit): number {
  return person.owner || person.key === null ? bit.bestSpeed : (bit.best?.[person.key] ?? 0);
}

export function withBest(person: Person, bit: HardBit, speed: number): HardBit {
  if (person.owner || person.key === null) return { ...bit, bestSpeed: speed };
  return { ...bit, best: { ...bit.best, [person.key]: speed } };
}

export function mergeHardBitsFrom(
  person: Person,
  incoming: readonly HardBit[],
  stored: readonly HardBit[],
): HardBit[] {
  const before = new Map(stored.map((b) => [b.id, b]));
  return incoming.map(({ best: _ignored, ...bit }) => {
    const old = before.get(bit.id);
    if (old) return { ...bit, bestSpeed: old.bestSpeed, ...(old.best ? { best: old.best } : {}) };
    return withBest(person, { ...bit, bestSpeed: 0 }, bit.bestSpeed);
  });
}
