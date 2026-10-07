import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { app: 'per-chordas-ad-astra' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization'], remove: true },
  });
}
