/**
 * Run the marketplace surface Playwright specs against a dev server wired to a throwaway DB.
 *
 *   npm run test:e2e:marketplace [-- <extra playwright args>]
 *
 * - Postgres + PostgREST in Docker (tests/support/gigs-test-db.ts, which also applies the package
 *   migrations), never the shared Supabase project
 * - the deterministic catalog from tests/fixtures/seed.ts (`seedMarketplaceCatalog`)
 * - a production build served by `next start` on MARKETPLACE_E2E_PORT (default 3200), or `next dev`
 *   with MARKETPLACE_E2E_SERVER=dev; Clerk stays the development instance from .env.local, so the
 *   signed-in specs use the saved E2E sessions (tests/fixtures/clerk-users.ts)
 * - Vercel Blob, Resend and the AI Gateway blanked, so nothing leaves the machine
 *
 * - the admin home's rows (tests/support/admin-home-seed.ts: QA queue, disputes, inbox threads,
 *   payments), so hub /admin shows known numbers
 *
 * Three Playwright phases on freshly seeded data: the admin home spec (`chromium`, read-only); the
 * e2e flows (`chromium`), which install, rate, publish and approve; then, reseeded, a11y +
 * screenshots in the four themed projects, so the screenshots never see what the e2e flows changed.
 * The admin home specs run only with ADMIN_HOME_E2E=1, which this runner sets. Everything is torn
 * down afterwards.
 *
 * Set MARKETPLACE_E2E_PHASE=admin, =e2e or =themed to run one phase.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { resetGigsTables, startGigsTestDb } from '../tests/support/gigs-test-db';
import { seedAdminHome } from '../tests/support/admin-home-seed';
import { playwrightCommand } from './playwright-run';

const root = path.resolve(__dirname, '..');
const port = Number(process.env.MARKETPLACE_E2E_PORT || 3200);
const baseUrl = `http://localhost:${port}`;
const ADMIN_SPECS = ['tests/e2e/admin-home.spec.ts'];
const E2E_SPECS = ['catalog', 'install', 'detail', 'publish', 'admin'].map((s) => `tests/e2e/marketplace-${s}.spec.ts`);
const THEMED_SPECS = ['tests/a11y/marketplace', 'tests/visual/marketplace', 'tests/a11y/admin-home', 'tests/visual/admin-home'];
const THEMED_PROJECTS = ['light-desktop', 'light-mobile', 'dark-desktop', 'dark-mobile'];
/** `start` (default): next build + next start. `dev`: next dev (faster to boot, flaky under load). */
const mode = process.env.MARKETPLACE_E2E_SERVER === 'dev' ? 'dev' : 'start';

async function waitForServer(url: string, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not start at ${url}`);
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit' });
    child.on('exit', (c) => resolve(c ?? 1));
  });
}

async function main() {
  const db = await startGigsTestDb();
  let server: ChildProcess | null = null;
  let code = 0;
  const dbEnv = {
    STORAGE_SUPABASE_URL: db.supabaseUrl,
    NEXT_PUBLIC_STORAGE_SUPABASE_URL: db.supabaseUrl,
    STORAGE_SUPABASE_SERVICE_ROLE_KEY: db.serviceRoleKey,
  };
  // Seeds through supabase-js, so point this process at the throwaway DB before importing the seeder.
  Object.assign(process.env, dbEnv);
  const { seedMarketplaceCatalog } = await import('../tests/fixtures/seed');
  // Fresh data: empty every table (also packages the specs published), then seed the catalog and the
  // admin home's rows.
  const reseed = async () => {
    await resetGigsTables(db.pgUrl, db.schema);
    await seedMarketplaceCatalog();
    await seedAdminHome(db.pgUrl, db.schema);
  };
  try {
    await reseed();
    const next = path.join(root, 'node_modules/next/dist/bin/next');
    const serverEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...dbEnv,
      NEXT_DIST_DIR: '.next-marketplace-e2e',
      NEXT_PUBLIC_APP_URL: baseUrl,
      PORT: String(port),
      TULZO_SURFACE: '',
      NEXT_PUBLIC_ROOT_DOMAIN: '',
      AI_GATEWAY_API_KEY: '',
      BLOB_READ_WRITE_TOKEN: '',
      RESEND_API_KEY: '',
      STORAGE_POSTGRES_URL: '',
      STORAGE_POSTGRES_URL_NON_POOLING: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    };
    if (mode === 'start') {
      // A production build: `next dev` under parallel specs recompiles and races on its manifests.
      const built = await run(process.execPath, [next, 'build'], { ...serverEnv, NODE_ENV: 'production' });
      if (built !== 0) throw new Error('next build failed');
    }
    server = spawn(process.execPath, [next, mode, '-p', String(port)], {
      cwd: root,
      env: { ...serverEnv, NODE_ENV: mode === 'start' ? 'production' : 'development' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await waitForServer(`${baseUrl}/robots.txt`);
    // Warm the marketplace routes one at a time (next dev compiles on first hit).
    for (const route of [
      '/marketplace', '/marketplace/fx-github-mcp', '/marketplace/publish', '/marketplace/admin', '/admin',
      '/api/marketplace/catalog', '/sign-in',
    ]) {
      await fetch(`${baseUrl}${route}`).catch(() => undefined);
    }

    const pwEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...dbEnv,
      PLAYWRIGHT_BASE_URL: baseUrl,
      MARKETPLACE_E2E: '1',
      ADMIN_HOME_E2E: '1',
    };
    // tests/global-setup.ts would seed api keys and relay rows; this DB only needs the seeded rows.
    pwEnv.STORAGE_SUPABASE_URL = '';
    pwEnv.NEXT_PUBLIC_STORAGE_SUPABASE_URL = '';
    const extra = process.argv.slice(2);
    const phase = process.env.MARKETPLACE_E2E_PHASE;

    if (!phase || phase === 'admin') {
      const pw = playwrightCommand(root, [...ADMIN_SPECS, '--project=chromium', ...extra], pwEnv);
      code = await run(pw.cmd, pw.args, pwEnv);
    }
    if (!phase || phase === 'e2e') {
      const pw = playwrightCommand(root, [...E2E_SPECS, '--project=chromium', ...extra], pwEnv);
      code = (await run(pw.cmd, pw.args, pwEnv)) || code;
    }
    if (!phase || phase === 'themed') {
      await reseed();
      const pw = playwrightCommand(root, [...THEMED_SPECS, ...THEMED_PROJECTS.map((p) => `--project=${p}`), ...extra], pwEnv);
      const themed = await run(pw.cmd, pw.args, pwEnv);
      code = code || themed;
    }
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    await db.stop();
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
