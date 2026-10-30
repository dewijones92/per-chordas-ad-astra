import { describe, expect, it } from 'vitest';
import { personFromEmail } from '../src/schemas.ts';

describe('personFromEmail', () => {
  it('names a person by the part of their email before the @, lower-cased and file-safe', () => {
    expect(personFromEmail('Dewi.Jones92@gmail.com')).toBe('dewi.jones92');
    expect(personFromEmail(' Someone+Music@example.com ')).toBe('someone-music');
    expect(personFromEmail('__x@example.com')).toBe('x');
    expect(personFromEmail('')).toBeNull();
    expect(personFromEmail(undefined)).toBeNull();
    expect(personFromEmail('@example.com')).toBeNull();
  });
});
