import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFindStub } from './find-stub.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = join(root, 'e2e', '.tmp', 'run');
rmSync(run, { recursive: true, force: true });
mkdirSync(run, { recursive: true });
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', join(run, 'remote.git')]);

const stub = await startFindStub();
writeFileSync(join(run, 'find-stub-origin.txt'), stub.origin);
console.info('dewidebug e2e find stand-in site listening', stub.origin);

const child = spawn(process.execPath, [join(root, 'apps', 'server', 'dist', 'server.mjs')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.argv[2] ?? '8799',
    HOST: '127.0.0.1',
    DATA_DIR: join(run, 'data'),
    DATA_REMOTE: join(run, 'remote.git'),
    STATIC_DIR: join(root, 'apps', 'web', 'dist'),
    COMMIT_IDLE_MS: '400',
    PUSH_RETRY_DELAYS_MS: '500',
    APP_VERSION: 'e2e',
    OWNER_PERSON: 'dewi',
    FIND_MUTOPIA_BASE: stub.origin,
    FIND_COMMONS_API: `${stub.origin}/w/api.php`,
    FIND_COMMONS_FILE_ORIGIN: stub.origin,
    FIND_MIN_GAP_MS: '0',
    LOG_LEVEL: 'info',
  },
});
const stop = () => {
  stub.server.close();
  child.kill('SIGTERM');
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => {
  stub.server.close();
  process.exit(code ?? 0);
});
