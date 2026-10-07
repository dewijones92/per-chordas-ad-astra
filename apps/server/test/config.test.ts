import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig({ DATA_DIR: '/data' });
    expect(c).toMatchObject({
      PORT: 8080,
      COMMIT_IDLE_MS: 20_000,
      DATA_BRANCH: 'main',
      TRUSTED_CIDRS: ['127.0.0.0/8', '::1/128'],
    });
    expect(c.PUSH_RETRY_DELAYS_MS).toEqual([5000, 30_000, 120_000, 300_000]);
  });

  it('parses lists and numbers from the environment', () => {
    const c = loadConfig({
      DATA_DIR: '/d',
      PORT: '9000',
      TRUSTED_CIDRS: '172.21.0.0/16, 127.0.0.1',
      PUSH_RETRY_DELAYS_MS: '100,200',
    });
    expect(c.PORT).toBe(9000);
    expect(c.TRUSTED_CIDRS).toEqual(['172.21.0.0/16', '127.0.0.1']);
    expect(c.PUSH_RETRY_DELAYS_MS).toEqual([100, 200]);
  });

  it('names every invalid setting', () => {
    expect(() => loadConfig({ PORT: 'x', COMMIT_IDLE_MS: '1' })).toThrow(
      /DATA_DIR[\s\S]*PORT|PORT[\s\S]*DATA_DIR/,
    );
    expect(() => loadConfig({ DATA_DIR: '/d', PUSH_RETRY_DELAYS_MS: '5,soon' })).toThrow(
      /PUSH_RETRY_DELAYS_MS/,
    );
  });
});
