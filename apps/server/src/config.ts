import { z } from 'zod';

const csv = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
);

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().min(1),
  DATA_REMOTE: z.string().default(''),
  DATA_BRANCH: z.string().default('main'),
  DATA_SSH_KEY_FILE: z.string().default(''),
  DATA_KNOWN_HOSTS_FILE: z.string().default(''),
  COMMIT_IDLE_MS: z.coerce.number().int().min(10).max(600_000).default(20_000),
  PUSH_RETRY_DELAYS_MS: csv
    .transform((parts) => parts.map(Number))
    .pipe(z.array(z.number().int().positive()).min(1))
    .default([5_000, 30_000, 120_000, 300_000]),
  GIT_AUTHOR_NAME: z.string().default('per-chordas-ad-astra'),
  GIT_AUTHOR_EMAIL: z.string().default('per-chordas-ad-astra@users.noreply.github.com'),
  TRUSTED_CIDRS: csv.default(['127.0.0.0/8', '::1/128']),
  STATIC_DIR: z.string().default(''),
  APP_VERSION: z.string().default('dev'),
  OWNER_PERSON: z
    .string()
    .regex(/^([a-z0-9][a-z0-9._-]{0,63})?$/)
    .default(''),
  FIND_MUTOPIA_BASE: z.url().default('https://www.mutopiaproject.org'),
  FIND_COMMONS_API: z.url().default('https://commons.wikimedia.org/w/api.php'),
  FIND_COMMONS_FILE_ORIGIN: z.url().default('https://upload.wikimedia.org'),
  FIND_MIN_GAP_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
  FIND_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(20_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
