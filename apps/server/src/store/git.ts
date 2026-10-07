import { execFile } from 'node:child_process';

export interface GitResult {
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} failed (exit ${String(exitCode)}): ${stderr.trim()}`);
    this.name = 'GitError';
  }
}

export interface GitOptions {
  cwd: string;
  authorName: string;
  authorEmail: string;
  sshKeyFile?: string;
  knownHostsFile?: string;
  timeoutMs?: number;
}

export type Git = (args: readonly string[]) => Promise<GitResult>;

export function createGit(opts: GitOptions): Git {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: opts.authorName,
    GIT_AUTHOR_EMAIL: opts.authorEmail,
    GIT_COMMITTER_NAME: opts.authorName,
    GIT_COMMITTER_EMAIL: opts.authorEmail,
    GIT_TERMINAL_PROMPT: '0',
  };
  if (opts.sshKeyFile) {
    const knownHosts = opts.knownHostsFile
      ? `-o UserKnownHostsFile=${opts.knownHostsFile} -o StrictHostKeyChecking=yes`
      : '-o StrictHostKeyChecking=yes';
    env['GIT_SSH_COMMAND'] =
      `ssh -i ${opts.sshKeyFile} -o IdentitiesOnly=yes -o BatchMode=yes -o CheckHostIP=no ${knownHosts}`;
  }
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        'git',
        ['-c', 'core.quotePath=false', '-c', 'color.ui=never', ...args],
        { cwd: opts.cwd, env, timeout: opts.timeoutMs ?? 120_000, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const code = typeof error.code === 'number' ? error.code : null;
            reject(new GitError(args, code, stderr || error.message));
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    });
}
