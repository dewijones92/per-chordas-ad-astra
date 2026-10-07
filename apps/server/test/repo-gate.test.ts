import { describe, expect, it } from 'vitest';
import { RepoGate } from '../src/store/repo-gate.ts';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('RepoGate', () => {
  it('lets writers run together but never alongside an exclusive section', async () => {
    const gate = new RepoGate();
    const events: string[] = [];
    const writer = (name: string) =>
      gate.write(async () => {
        events.push(`${name} start`);
        await tick();
        events.push(`${name} end`);
      });
    const w1 = writer('w1');
    const ex = gate.exclusive(async () => {
      events.push('ex start');
      await tick();
      events.push('ex end');
    });
    const w2 = writer('w2');
    await Promise.all([w1, ex, w2]);
    expect(events).toEqual(['w1 start', 'w1 end', 'ex start', 'ex end', 'w2 start', 'w2 end']);
  });

  it('releases the gate when a section throws', async () => {
    const gate = new RepoGate();
    await expect(gate.exclusive(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(gate.write(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
