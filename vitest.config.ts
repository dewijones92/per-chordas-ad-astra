import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './apps/server',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 20_000,
        },
      },
      './apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**', 'apps/server/src/**', 'apps/web/src/**'],
      exclude: [
        '**/*.d.ts',
        'apps/server/src/main.ts',
        'apps/server/src/log.ts',
        'apps/web/src/**/*.tsx',
        'apps/web/src/metronome/engine.ts',
        'apps/web/src/tuner/use-tuner.ts',
        'apps/web/src/annotate/use-annotations.ts',
        'apps/web/src/score/pdf.ts',
        'apps/web/src/sync/use-sync.ts',
      ],
      thresholds: { lines: 75, functions: 75, branches: 70, statements: 75 },
    },
  },
});
