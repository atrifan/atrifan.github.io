import { afterEach, describe, expect, it } from 'vitest';
import { playwrightCommand } from '@/scripts/playwright-run';

const ROOT = '/repo';
const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_SECRET_VALUE',
  JOBS_E2E_AUTH_SECRET: 'jobs-secret-value',
  GITHUB_FAKE_URL: 'http://localhost:4100',
  GITHUB_TOKEN: 'ghp_host_token',
  PATH: '/usr/bin',
  HOME: '/Users/me',
  NODE_OPTIONS: '--max-old-space-size=4096',
  UNSET: undefined,
};

describe('playwrightCommand', () => {
  const previous = process.env.PW_DOCKER_IMAGE;
  afterEach(() => {
    if (previous === undefined) delete process.env.PW_DOCKER_IMAGE;
    else process.env.PW_DOCKER_IMAGE = previous;
  });

  it('runs the local CLI without PW_DOCKER_IMAGE', () => {
    delete process.env.PW_DOCKER_IMAGE;
    const { cmd, args } = playwrightCommand(ROOT, ['a.spec.ts'], ENV);
    expect(cmd).toBe(process.execPath);
    expect(args).toEqual(['/repo/node_modules/@playwright/test/cli.js', 'test', 'a.spec.ts']);
  });

  describe('in Docker', () => {
    const run = () => {
      process.env.PW_DOCKER_IMAGE = 'mcr.microsoft.com/playwright:v1.61.1-noble';
      return playwrightCommand(ROOT, ['a.spec.ts'], ENV);
    };

    it('never puts a value on the command line (it would show in ps)', () => {
      const { args } = run();
      const line = args.join(' ');
      for (const value of ['sk_test_SECRET_VALUE', 'jobs-secret-value', 'http://localhost:4100']) expect(line).not.toContain(value);
      expect(args.some((a) => /^[A-Z_][A-Z0-9_]*=/.test(a))).toBe(false);
    });

    it('forwards the variables by name, so docker takes the values from its own environment', () => {
      const { cmd, args } = run();
      expect(cmd).toBe('docker');
      const names = args.flatMap((a, i) => (args[i - 1] === '-e' ? [a] : []));
      expect(names.sort()).toEqual(['GITHUB_FAKE_URL', 'JOBS_E2E_AUTH_SECRET', 'STRIPE_SECRET_KEY']);
    });

    it('leaves host-only and unset variables out', () => {
      const line = run().args.join(' ');
      for (const k of ['PATH', 'HOME', 'NODE_OPTIONS', 'GITHUB_TOKEN', 'UNSET']) expect(line).not.toMatch(new RegExp(`(^| )${k}( |$)`));
    });

    it('mounts the repo, uses host networking and runs playwright test in the image', () => {
      const { args } = run();
      expect(args.slice(0, 7)).toEqual(['run', '--rm', '--network', 'host', '-v', '/repo:/repo', '-w']);
      expect(args.slice(-5)).toEqual(['mcr.microsoft.com/playwright:v1.61.1-noble', 'npx', 'playwright', 'test', 'a.spec.ts']);
    });
  });
});
