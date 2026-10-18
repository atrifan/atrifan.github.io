import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// While Clerk runs on its development instance (sessions are per host), every surface is served from
// tulzo.online in path-prefix mode and the subdomains redirect there. See .claude/rules/surfaces-and-design.md.
const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  redirects?: Array<{ source: string; destination: string; has?: Array<{ type: string; value: string }>; permanent: boolean }>;
};
const forHost = (host: string) => (config.redirects ?? []).filter((r) => r.has?.some((h) => h.type === 'host' && h.value === host));

for (const s of ['ai', 'marketplace', 'gigs', 'chat']) {
  test(`${s}.tulzo.online pages go to tulzo.online/${s} and its API to tulzo.online/api`, () => {
    const rules = forHost(`${s}.tulzo.online`);
    assert.equal(rules.length, 3);
    assert.deepEqual(rules[0], { source: '/api/:path*', has: [{ type: 'host', value: `${s}.tulzo.online` }], destination: 'https://tulzo.online/api/:path*', permanent: false });
    // Vercel's `/:path*` does not match the bare root, so `/` has its own rule (measured on the live site).
    assert.equal(rules[1].source, '/');
    assert.equal(rules[1].destination, `https://tulzo.online/${s}`);
    assert.equal(rules[1].permanent, false);
    assert.equal(rules[2].source, '/:path*');
    assert.equal(rules[2].destination, `https://tulzo.online/${s}/:path*`);
    assert.equal(rules[2].permanent, false);
  });
}

test('jobs goes to gigs, www goes to the apex permanently', () => {
  const jobs = forHost('jobs.tulzo.online');
  assert.deepEqual(jobs.map((r) => [r.source, r.destination]), [['/', 'https://tulzo.online/gigs'], ['/:path*', 'https://tulzo.online/gigs/:path*']]);
  const www = forHost('www.tulzo.online')[0];
  assert.equal(www.destination, 'https://tulzo.online/:path*');
  assert.equal(www.permanent, true);
});

test('crons stay daily and there is no email dispatch cron', () => {
  const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  assert.ok(crons.every((c) => !c.path.includes('dispatch')));
  assert.ok(crons.every((c) => /^\d+ \d+ \* \* \*$/.test(c.schedule)));
});

test('host redirects exist only for the four surface subdomains, jobs, www and the old vercel.app alias', () => {
  const hosts = new Set((config.redirects ?? []).flatMap((r) => (r.has ?? []).filter((h) => h.type === 'host').map((h) => h.value)));
  assert.deepEqual([...hosts].sort(), [...['ai', 'chat', 'gigs', 'jobs', 'marketplace'].map((s) => `${s}.tulzo.online`), 'tulzo.vercel.app', 'www.tulzo.online']);
  assert.equal((config.redirects ?? []).length, 17);
});

// The switch-over to real subdomains (once Clerk is on production keys) is documented in the surfaces rule.
test('the surfaces rule documents the hybrid deployment and the switch-over', () => {
  const rule = readFileSync('.claude/rules/surfaces-and-design.md', 'utf8');
  const section = rule.slice(rule.indexOf('### Current deployment'), rule.indexOf('### Domains'));
  for (const fact of ['TULZO_ROUTING=hybrid', 'TULZO_LINKS=path', 'TULZO_LINKS=host', 'NEXT_PUBLIC_ROOT_DOMAIN=tulzo.online', 'vercel-path-mode.test.ts']) {
    assert.ok(section.includes(fact), `Current deployment section names ${fact}`);
  }
  assert.ok(!section.includes('TULZO_SURFACE=hub'), 'no per-project TULZO_SURFACE');
  assert.ok(!/tulzo-(ai|marketplace|gigs|chat)\b|five Vercel projects|four surface projects/.test(rule), 'no per-surface Vercel projects');
});

// Clerk's development instance keeps one session per host, so a visitor signed in on tulzo.online looked
// signed out on tulzo.vercel.app until they clicked "Sign in" (measured on the live site, 2026-10-18).
// Pages on the old vercel.app alias go to the apex; its /api stays, because devices still call it there.
test('tulzo.vercel.app pages go to the apex (308), its /api is not redirected', () => {
  const rules = forHost('tulzo.vercel.app');
  assert.deepEqual(
    rules.map((r) => [r.source, r.destination, r.permanent]),
    [
      ['/', 'https://tulzo.online/', true],
      ['/:path((?!api/).*)', 'https://tulzo.online/:path', true],
    ],
  );
});

test('no user-facing text sends people to tulzo.vercel.app', () => {
  const files = ['app/api/mcp/route.ts', 'app/api/mcp/[key]/route.ts'];
  for (const f of files) assert.ok(!readFileSync(f, 'utf8').includes('tulzo.vercel.app'), f);
});
