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
  const owner = ownerKey === '' || key === null || key === ownerKey;
  if (owner) {
    const stamp = ownerKey === '' ? undefined : ownerKey;
    return { key, owner, stamp, owns: (who) => who === undefined || who === stamp };
  }
  return { key, owner, stamp: key, owns: (who) => who === key };
}

export const SOLE_USER: Person = personOf(undefined, '');

export function hardBitsFor(person: Person, bits: readonly HardBit[]): HardBit[] {
  return bits.map(({ best, ...bit }) =>
    person.owner || person.key === null ? bit : { ...bit, bestSpeed: best?.[person.key] ?? 0 },
  );
}

export function mergeHardBitsFrom(
  person: Person,
  incoming: readonly HardBit[],
  stored: readonly HardBit[],
): HardBit[] {
  const before = new Map(stored.map((b) => [b.id, b]));
  return incoming.map(({ best: _ignored, ...bit }) => {
    const old = before.get(bit.id);
    const best = old?.best ?? {};
    if (person.owner || person.key === null) {
      return Object.keys(best).length > 0 ? { ...bit, best } : bit;
    }
    return {
      ...bit,
      bestSpeed: old?.bestSpeed ?? 0,
      best: { ...best, [person.key]: bit.bestSpeed },
    };
  });
}
