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
    assert.equal(rules.length, 2);
    assert.deepEqual(rules[0], { source: '/api/:path*', has: [{ type: 'host', value: `${s}.tulzo.online` }], destination: 'https://tulzo.online/api/:path*', permanent: false });
    assert.equal(rules[1].source, '/:path*');
    assert.equal(rules[1].destination, `https://tulzo.online/${s}/:path*`);
    assert.equal(rules[1].permanent, false);
  });
}

test('jobs goes to gigs, www goes to the apex permanently', () => {
  assert.equal(forHost('jobs.tulzo.online')[0].destination, 'https://tulzo.online/gigs/:path*');
  const www = forHost('www.tulzo.online')[0];
  assert.equal(www.destination, 'https://tulzo.online/:path*');
  assert.equal(www.permanent, true);
});

test('crons stay daily and there is no email dispatch cron', () => {
  const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  assert.ok(crons.every((c) => !c.path.includes('dispatch')));
  assert.ok(crons.every((c) => /^\d+ \d+ \* \* \*$/.test(c.schedule)));
});
