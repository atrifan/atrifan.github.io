/**
 * How the e2e runners (test-e2e-gigs.ts, test-e2e-marketplace.ts) start `playwright test`.
 *
 * Locally: the repo's Playwright CLI under this Node. With PW_DOCKER_IMAGE set (CI, and when
 * regenerating Linux baselines on a Mac): the same command inside that image (the one in
 * .claude/rules/testing.md, mcr.microsoft.com/playwright:v1.61.1-noble), with host networking
 * so the runner's dev server, Docker DB and fakes on localhost stay reachable. The env is passed
 * into the container except for host-specific variables (paths, shell, Node/npm settings).
 *
 * Variables are forwarded by name only (`-e NAME`): docker reads each value from its own process
 * environment, which the caller sets to the same env when it spawns the command. Values never
 * reach the command line, where `ps` would show the secrets.
 */
import path from 'node:path';

const HOST_ONLY = /^(PATH|HOME|PWD|OLDPWD|SHELL|USER|LOGNAME|TMPDIR|TMP|TEMP|TERM.*|LANG|LC_.*|SSH_.*|XPC_.*|__CF.*|NODE.*|NVM_.*|npm_.*|INIT_CWD|COLOR.*|PW_DOCKER_IMAGE|PLAYWRIGHT_BROWSERS_PATH|DOCKER_.*|RUNNER_.*|GITHUB_(?!FAKE_URL$).*|ACTIONS_.*|ImageOS|ImageVersion|AGENT_.*|_)$/;

export function playwrightCommand(root: string, args: string[], env: NodeJS.ProcessEnv): { cmd: string; args: string[] } {
  const image = process.env.PW_DOCKER_IMAGE;
  if (!image) return { cmd: process.execPath, args: [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...args] };
  const forwarded = Object.entries(env)
    .filter(([k, v]) => v !== undefined && !HOST_ONLY.test(k))
    .flatMap(([k]) => ['-e', k]);
  return {
    cmd: 'docker',
    args: ['run', '--rm', '--network', 'host', '-v', `${root}:${root}`, '-w', root, ...forwarded, image, 'npx', 'playwright', 'test', ...args],
  };
}
