import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './log.ts';
import { DataRepo } from './store/data-repo.ts';
import { ResumeStore } from './store/resume-store.ts';
import { createGit } from './store/git.ts';
import { SyncEngine } from './store/sync-engine.ts';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);

const git = createGit({
  cwd: config.DATA_DIR,
  authorName: config.GIT_AUTHOR_NAME,
  authorEmail: config.GIT_AUTHOR_EMAIL,
  ...(config.DATA_SSH_KEY_FILE ? { sshKeyFile: config.DATA_SSH_KEY_FILE } : {}),
  ...(config.DATA_KNOWN_HOSTS_FILE ? { knownHostsFile: config.DATA_KNOWN_HOSTS_FILE } : {}),
});

const sync = new SyncEngine({
  git,
  dir: config.DATA_DIR,
  remote: config.DATA_REMOTE,
  branch: config.DATA_BRANCH,
  idleMs: config.COMMIT_IDLE_MS,
  retryDelaysMs: config.PUSH_RETRY_DELAYS_MS,
  log,
});

log.info(
  {
    version: config.APP_VERSION,
    dataDir: config.DATA_DIR,
    remote: config.DATA_REMOTE || '(none)',
    idleMs: config.COMMIT_IDLE_MS,
    trusted: config.TRUSTED_CIDRS,
  },
  'dewidebug starting',
);

await sync.init();

const repo = new DataRepo({ dir: config.DATA_DIR, changes: sync, log });
const resume = new ResumeStore(config.DATA_DIR, log);
const app = createApp({
  repo,
  resume,
  sync,
  log,
  version: config.APP_VERSION,
  trustedCidrs: config.TRUSTED_CIDRS,
  ...(config.STATIC_DIR ? { staticDir: config.STATIC_DIR } : {}),
});

const server = serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
  log.info({ port: info.port, host: config.HOST }, 'dewidebug listening');
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'dewidebug shutting down: flushing unsaved changes to GitHub');
  server.close();
  try {
    await sync.close();
    log.info({ sync: sync.status() }, 'dewidebug shutdown complete');
  } catch (error) {
    log.error({ err: error }, 'dewidebug shutdown flush failed; changes remain in the local clone');
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
