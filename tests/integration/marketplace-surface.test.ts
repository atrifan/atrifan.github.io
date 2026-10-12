/**
 * Marketplace surface: discover (catalog wire format), the public catalog API, publish (API key
 * and signed-in web, new kinds, pending moderation), install counting from the web, admin
 * moderation, and the MCP tools sharing the same service. Against the throwaway DB from
 * `npm run test:integration` (package migrations + 20261205 applied).
 */
import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { authState, call, requireTestDb, sql } from './helpers';

// ---- Clerk + Vercel Blob mocks (before importing any route) ----
type ClerkUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  emailAddresses: Array<{ emailAddress: string }>;
  publicMetadata: Record<string, unknown>;
};
const clerk = { users: new Map<string, ClerkUser>(), plans: new Map<string, string>() };
const blobPuts: Array<{ path: string; size: number }> = [];

mock.module(pathToFileURL(require.resolve('@clerk/nextjs/server')).href, {
  namedExports: {
    auth: async () => ({
      userId: authState.userId,
      sessionClaims: authState.userId && clerk.plans.has(authState.userId) ? { pla: clerk.plans.get(authState.userId) } : {},
    }),
    currentUser: async () => {
      const id = authState.userId;
      const u = id ? clerk.users.get(id) : undefined;
      return u ? { id, ...u } : null;
    },
    clerkClient: async () => ({
      users: {
        getUser: async (id: string) => {
          const u = clerk.users.get(id);
          if (!u) throw new Error('user not found');
          return { id, ...u };
        },
      },
    }),
  },
});
mock.module(pathToFileURL(require.resolve('@vercel/blob')).href, {
  namedExports: {
    put: async (path: string, file: Blob) => {
      blobPuts.push({ path, size: file.size });
      return { url: `https://blob.test/${path}` };
    },
    del: async () => undefined,
  },
});

const PRO_KEY = 'tlz_test_marketplace_surface_pro';
const FREE_KEY = 'tlz_test_marketplace_surface_free';
const API_USER = 'user_api_publisher';
const PAID = 'user_paid_web';
const FREE = 'user_free_web';
const ADMIN = 'user_admin_web';
const OTHER = 'user_other';

let discover: typeof import('../../app/api/marketplace/discover/route');
let catalog: typeof import('../../app/api/marketplace/catalog/route');
let publish: typeof import('../../app/api/marketplace/publish/route');
let install: typeof import('../../app/api/marketplace/install/route');
let pkgRoute: typeof import('../../app/api/packages/[id]/route');
let service: typeof import('../../src/lib/marketplace-service');
let tools: typeof import('../../src/lib/marketplace-mcp-tools');

const hash = (k: string) => createHash('sha256').update(k).digest('hex');
const bearer = (k: string) => ({ authorization: `Bearer ${k}` });

async function resetPackages(): Promise<void> {
  const { schema } = requireTestDb();
  await sql(`TRUNCATE ${['package_installs', 'package_ratings', 'package_versions', 'packages'].map((t) => `${schema}.${t}`).join(', ')} CASCADE`);
}

interface Seed {
  id: string;
  name?: string;
  type?: string;
  visibility?: string;
  installs?: number;
  tags?: string[];
  category?: string | null;
  created?: string;
  verified?: boolean;
  owner?: string | null;
  config?: Record<string, unknown> | null;
  blob?: string;
  provenance?: Record<string, unknown> | null;
  description?: string;
}

async function seedPackage(s: Seed): Promise<void> {
  await sql(
    `INSERT INTO packages (id, name, description, type, latest_version, blob_url, config_json, created_by, owner_user_id,
       visibility, install_count, tags, category, created_at, updated_at, verified_at, provenance, files_hash, publisher_name)
     VALUES ($1,$2,$3,$4,'1.0.0',$5,$6,'seed',$7,$8,$9,$10,$11,$12,$12,$13,$14,$15,$16)`,
    [
      s.id, s.name ?? s.id, s.description ?? `About ${s.id}`, s.type ?? 'skill', s.blob ?? `https://blob.example.com/${s.id}.zip`,
      s.config ? JSON.stringify(s.config) : null, s.owner === undefined ? 'seed_owner' : s.owner, s.visibility ?? 'public',
      s.installs ?? 0, s.tags ?? [], s.category ?? null, s.created ?? '2026-01-01T00:00:00Z',
      s.verified ? '2026-01-02T00:00:00Z' : null, s.provenance ? JSON.stringify(s.provenance) : null, `sha256:${s.id}`, 'Seed Co',
    ],
  );
}

async function rate(id: string, ratings: number[]): Promise<void> {
  for (const [i, r] of ratings.entries()) {
    await sql(`INSERT INTO package_ratings (package_id, user_id, rating, review) VALUES ($1, $2, $3, $4)`, [id, `rater_${i}`, r, `review ${i}`]);
  }
}

async function seedCatalog(): Promise<void> {
  await seedPackage({ id: 'gh', name: 'GitHub Tools', type: 'mcp', installs: 100, tags: ['github', 'git'], category: 'developer-tools', verified: true, created: '2026-03-01T00:00:00Z', config: { transport: 'http', url: 'https://mcp.example.com/gh' }, blob: '' });
  await seedPackage({ id: 'pdf', name: 'PDF Summarizer', type: 'skill', installs: 50, tags: ['pdf'], category: 'productivity', verified: true, created: '2026-02-01T00:00:00Z' });
  await seedPackage({ id: 'trip', name: 'Travel Agent', type: 'a2a', installs: 10, tags: ['travel'], category: 'productivity', created: '2026-04-01T00:00:00Z', config: { card_url: 'https://a.example.com/card.json' }, blob: '' });
  await seedPackage({ id: 'rev', name: 'Code Reviewer', type: 'subagent', installs: 20, tags: ['github', 'review'], category: 'developer-tools', verified: true, created: '2026-05-01T00:00:00Z', provenance: { translated_from: 'claude-code:code-reviewer' } });
  await seedPackage({ id: 'rel', name: 'Release Flow', type: 'workflow', installs: 5, tags: ['ci'], category: 'developer-tools', created: '2026-06-01T00:00:00Z' });
  await seedPackage({ id: 'pending-one', name: 'Pending One', type: 'mcp', visibility: 'pending', config: { transport: 'sse', url: 'https://p.example.com/sse' }, blob: '', owner: OTHER });
  await seedPackage({ id: 'hidden-one', name: 'Hidden One', visibility: 'private' });
  await rate('pdf', [5, 5]);
  await rate('gh', [5, 4]);
  await rate('rev', [3]);
}

before(async () => {
  for (const t of ['package_installs', 'package_ratings', 'package_versions', 'packages', 'api_keys']) {
    await sql(`DELETE FROM ${t}`);
  }
  await sql(
    `INSERT INTO api_keys (user_id, api_key_hash, api_key_suffix, name, plan, is_active) VALUES
       ($1, $2, 'xpro', 'mp-pro', 'pro', true), ('user_api_free', $3, 'free', 'mp-free', 'free', true)`,
    [API_USER, hash(PRO_KEY), hash(FREE_KEY)],
  );
  clerk.users.set(PAID, { firstName: 'Paula', lastName: 'Paid', emailAddresses: [{ emailAddress: 'paula@example.com' }], publicMetadata: {} });
  clerk.users.set(FREE, { firstName: 'Fred', lastName: null, emailAddresses: [{ emailAddress: 'fred@example.com' }], publicMetadata: {} });
  clerk.users.set(ADMIN, { username: 'ada', emailAddresses: [{ emailAddress: 'ada@example.com' }], publicMetadata: { role: 'admin' } });
  clerk.users.set(OTHER, { firstName: 'Otto', emailAddresses: [{ emailAddress: 'otto@example.com' }], publicMetadata: {} });
  clerk.plans.set(PAID, 'u:pro');
  discover = await import('../../app/api/marketplace/discover/route');
  catalog = await import('../../app/api/marketplace/catalog/route');
  publish = await import('../../app/api/marketplace/publish/route');
  install = await import('../../app/api/marketplace/install/route');
  pkgRoute = await import('../../app/api/packages/[id]/route');
  service = await import('../../src/lib/marketplace-service');
  tools = await import('../../src/lib/marketplace-mcp-tools');
});

beforeEach(async () => {
  await resetPackages();
  await seedCatalog();
  blobPuts.length = 0;
  authState.userId = null;
});

after(async () => {
  await resetPackages();
  await sql('DELETE FROM api_keys');
});

// ---------------- discover ----------------

test('discover keeps its shape and adds the catalog wire format', async () => {
  const res = await call(discover.GET, { url: '/api/marketplace/discover', headers: bearer(PRO_KEY) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.plan, 'pro');
  assert.equal(res.body.count, res.body.results.length);
  const ids = res.body.results.map((r: { id: string }) => r.id);
  assert.deepEqual(ids, ['gh', 'pdf', 'rev', 'trip', 'rel']);
  const gh = res.body.results[0];
  assert.deepEqual(gh.install, { source_type: 'mcp', config_json: { transport: 'http', url: 'https://mcp.example.com/gh' } });
  assert.equal(gh.rating, 4.5);
  assert.equal(gh.rating_count, 2);
  assert.equal(gh.kind, 'mcp');
  assert.equal(gh.title, 'GitHub Tools');
  assert.deepEqual(gh.capabilities, ['github', 'git']);
  assert.equal(gh.files_hash, 'sha256:gh');
  assert.equal(gh.install_url, 'https://mcp.example.com/gh');
  assert.deepEqual(gh.badges, ['verified']);
  assert.equal('provenance' in gh, false);
  const rev = res.body.results.find((r: { id: string }) => r.id === 'rev');
  assert.equal(rev.kind, 'sub-agent');
  assert.deepEqual(rev.provenance, { translated_from: 'claude-code:code-reviewer' });
  assert.deepEqual(rev.badges, ['verified', 'translated']);
  const trip = res.body.results.find((r: { id: string }) => r.id === 'trip');
  assert.equal(trip.install.source_type, 'a2a');
  assert.equal(trip.install_url, 'https://a.example.com/card.json');
});

test('discover filters by the new kinds and by tag', async () => {
  for (const [type, expected] of [['a2a', ['trip']], ['subagent', ['rev']], ['workflow', ['rel']]] as const) {
    const res = await call(discover.GET, { url: `/api/marketplace/discover?type=${type}`, headers: bearer(PRO_KEY) });
    assert.deepEqual(res.body.results.map((r: { id: string }) => r.id), expected);
  }
  const tagged = await call(discover.GET, { url: '/api/marketplace/discover?tag=github', headers: bearer(PRO_KEY) });
  assert.deepEqual(tagged.body.results.map((r: { id: string }) => r.id), ['gh', 'rev']);
});

test('discover still refuses free and missing keys', async () => {
  assert.equal((await call(discover.GET, { url: '/api/marketplace/discover' })).status, 401);
  assert.equal((await call(discover.GET, { url: '/api/marketplace/discover', headers: bearer(FREE_KEY) })).status, 403);
});

// ---------------- public catalog ----------------

test('catalog API is public, lists only public packages, most popular first, with paging info', async () => {
  const res = await call(catalog.GET, { url: '/api/marketplace/catalog' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i: { id: string }) => i.id), ['gh', 'pdf', 'rev', 'trip', 'rel']);
  assert.equal(res.body.total, 5);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.pages, 1);
  assert.equal(res.body.pageSize, 12);
  const gh = res.body.items[0];
  assert.equal(gh.publisher, 'Seed Co');
  assert.equal(gh.verified, true);
  assert.equal(gh.rating, 4.5);
  assert.equal(gh.ratingCount, 2);
});

test('catalog filters by kind, category, tag and search, and sorts by new and top rated', async () => {
  const ids = async (qs: string) =>
    (await call(catalog.GET, { url: `/api/marketplace/catalog${qs}` })).body.items.map((i: { id: string }) => i.id);
  assert.deepEqual(await ids('?kind=a2a'), ['trip']);
  assert.deepEqual(await ids('?category=developer-tools'), ['gh', 'rev', 'rel']);
  assert.deepEqual(await ids('?tag=github'), ['gh', 'rev']);
  assert.deepEqual(await ids('?q=pdf'), ['pdf']);
  assert.deepEqual(await ids('?q=about%20rel'), ['rel']);
  assert.deepEqual(await ids('?sort=new'), ['rel', 'rev', 'trip', 'gh', 'pdf']);
  assert.deepEqual(await ids('?sort=top'), ['pdf', 'gh', 'rev', 'trip', 'rel']);
  assert.deepEqual(await ids('?kind=skill&q=zzz'), []);
  assert.deepEqual(await ids('?q=%25'), []);
});

test('catalog pages and restricts to given ids (the installed filter)', async () => {
  const page2 = await service.queryCatalog({ ...service.parseCatalogQuery({ page: '2' }) }, { pageSize: 2 });
  assert.deepEqual(page2.items.map((i) => i.id), ['rev', 'trip']);
  assert.equal(page2.total, 5);
  assert.equal(page2.pages, 3);
  const res = await call(catalog.GET, { url: '/api/marketplace/catalog?ids=pdf,trip,hidden-one,nope' });
  assert.deepEqual(res.body.items.map((i: { id: string }) => i.id), ['pdf', 'trip']);
  const none = await call(catalog.GET, { url: '/api/marketplace/catalog?installed=1&ids=' });
  assert.deepEqual(none.body.items, []);
});

// ---------------- detail ----------------

test('package detail resolves by id or name slug, hides non-public packages, and lists versions and reviews', async () => {
  await sql(`INSERT INTO package_versions (package_id, version, blob_url, created_at) VALUES
    ('pdf', '1.0.0', 'u1', '2026-01-01'), ('pdf', '1.1.0', 'u2', '2026-01-05')`);
  const byId = await service.getPackageDetail('pdf');
  assert.equal(byId?.item.name, 'PDF Summarizer');
  assert.deepEqual(byId?.versions.map((v) => v.version), ['1.1.0', '1.0.0']);
  assert.equal(byId?.reviews.length, 2);
  assert.equal((await service.getPackageDetail('github-tools'))?.item.id, 'gh');
  assert.equal(await service.getPackageDetail('pending-one'), null);
  assert.equal(await service.getPackageDetail('hidden-one'), null);
  assert.equal(await service.getPackageDetail('nope'), null);
});

// ---------------- publish ----------------

test('API-key publish of an A2A agent lands pending with tags, category and a config hash', async () => {
  const res = await call(publish.POST, {
    method: 'POST',
    url: '/api/marketplace/publish',
    headers: bearer(PRO_KEY),
    body: { id: 'new-a2a', name: 'New Agent', type: 'a2a', config_json: { card_url: 'https://n.example.com/card.json' }, tags: 'Travel, Ops', category: 'productivity' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true, id: 'new-a2a', version: '1.0.0', visibility: 'pending' });
  const [row] = await sql<Record<string, any>>(`SELECT * FROM packages WHERE id = 'new-a2a'`);
  assert.equal(row.type, 'a2a');
  assert.equal(row.visibility, 'pending');
  assert.equal(row.owner_user_id, API_USER);
  assert.deepEqual(row.tags, ['travel', 'ops']);
  assert.equal(row.category, 'productivity');
  assert.match(row.files_hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(row.verified_at, null);
  const versions = await sql(`SELECT version, files_hash FROM package_versions WHERE package_id = 'new-a2a'`);
  assert.deepEqual(versions, [{ version: '1.0.0', files_hash: row.files_hash }]);
});

test('API-key publish rejects bad input: missing card URL, reserved id, unknown kind', async () => {
  const post = (body: Record<string, unknown>) =>
    call(publish.POST, { method: 'POST', url: '/api/marketplace/publish', headers: bearer(PRO_KEY), body });
  assert.equal((await post({ id: 'x', name: 'X', type: 'a2a', config_json: {} })).status, 400);
  assert.equal((await post({ id: 'publish', name: 'X', type: 'mcp', config_json: { transport: 'http', url: 'https://x' } })).status, 400);
  assert.equal((await post({ id: 'x', name: 'X', type: 'rocket' })).status, 400);
  assert.equal((await sql(`SELECT id FROM packages WHERE id IN ('x', 'publish')`)).length, 0);
});

test('multipart publish of a sub-agent stores the archive and its sha256', async () => {
  const { NextRequest } = await import('next/server');
  const form = new FormData();
  form.set('id', 'zip-agent');
  form.set('name', 'Zip Agent');
  form.set('type', 'subagent');
  form.set('version', '0.2.0');
  const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
  form.set('file', new Blob([bytes], { type: 'application/zip' }), 'a.zip');
  const req = new NextRequest(new URL('http://localhost:3000/api/marketplace/publish'), { method: 'POST', body: form, headers: bearer(PRO_KEY) });
  const res = await publish.POST(req);
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(blobPuts, [{ path: 'packages/zip-agent/0.2.0.zip', size: 7 }]);
  const [row] = await sql<Record<string, any>>(`SELECT type, blob_url, files_hash, visibility FROM packages WHERE id = 'zip-agent'`);
  assert.equal(row.type, 'subagent');
  assert.equal(row.blob_url, 'https://blob.test/packages/zip-agent/0.2.0.zip');
  assert.equal(row.files_hash, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  assert.equal(row.visibility, 'pending');
});

test('signed-in web publish: 401 signed out, 403 on the free plan, pending for paid users and admins', async () => {
  const body = { id: 'web-mcp', name: 'Web MCP', type: 'mcp', config_json: { transport: 'http', url: 'https://w.example.com/mcp' } };
  const post = (user: string | null, b = body) => call(publish.POST, { method: 'POST', url: '/api/marketplace/publish', body: b, user });
  assert.equal((await post(null)).status, 401);
  const free = await post(FREE);
  assert.equal(free.status, 403);
  assert.equal(free.body.error, 'plan_required');
  const paid = await post(PAID);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.visibility, 'pending');
  const [row] = await sql<Record<string, any>>(`SELECT owner_user_id, publisher_name, visibility FROM packages WHERE id = 'web-mcp'`);
  assert.deepEqual(row, { owner_user_id: PAID, publisher_name: 'Paula Paid', visibility: 'pending' });
  const admin = await post(ADMIN, { ...body, id: 'admin-mcp' });
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  const [adminRow] = await sql<Record<string, any>>(`SELECT publisher_name, visibility FROM packages WHERE id = 'admin-mcp'`);
  assert.deepEqual(adminRow, { publisher_name: 'ada', visibility: 'pending' });
});

test('a new version by the owner moves the package back to pending; others get not_owner', async () => {
  const post = (user: string, version: string) =>
    call(publish.POST, {
      method: 'POST',
      url: '/api/marketplace/publish',
      body: { id: 'pending-one', name: 'Pending One', type: 'mcp', version, config_json: { transport: 'sse', url: 'https://p.example.com/sse2' } },
      user,
    });
  const notOwner = await post(PAID, '2.0.0');
  assert.equal(notOwner.status, 403);
  assert.equal(notOwner.body.error, 'not_owner');
  clerk.plans.set(OTHER, 'u:plus');
  await sql(`UPDATE packages SET visibility = 'public', verified_at = NOW() WHERE id = 'pending-one'`);
  const ok = await post(OTHER, '1.1.0');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const [row] = await sql<Record<string, any>>(`SELECT latest_version, visibility, verified_at FROM packages WHERE id = 'pending-one'`);
  assert.deepEqual(row, { latest_version: '1.1.0', visibility: 'pending', verified_at: null });
  const versions = await sql<{ version: string }>(`SELECT version FROM package_versions WHERE package_id = 'pending-one'`);
  assert.deepEqual(versions.map((v) => v.version), ['1.1.0']);
});

// ---------------- install ----------------

test('install from the web counts once per call for signed-in users, only for public packages', async () => {
  const post = (user: string | null, body: Record<string, unknown>) =>
    call(install.POST, { method: 'POST', url: '/api/marketplace/install', body, user });
  assert.equal((await post(null, { package_id: 'pdf' })).status, 401);
  const ok = await post(FREE, { package_id: 'pdf' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const [{ install_count }] = await sql<{ install_count: number }>(`SELECT install_count FROM packages WHERE id = 'pdf'`);
  assert.equal(install_count, 51);
  const events = await sql<Record<string, unknown>>(`SELECT user_id, version FROM package_installs WHERE package_id = 'pdf'`);
  assert.deepEqual(events, [{ user_id: FREE, version: '1.0.0' }]);
  assert.equal((await post(FREE, { package_id: 'hidden-one' })).status, 404);
  assert.equal((await post(FREE, { package_id: 'nope' })).status, 404);
  assert.equal((await post(FREE, {})).status, 400);
});

test('install with an API key still works for the assistant', async () => {
  const res = await call(install.POST, { method: 'POST', url: '/api/marketplace/install', headers: bearer(PRO_KEY), body: { package_id: 'gh', version: '1.0.0' } });
  assert.equal(res.status, 200);
  const [{ install_count }] = await sql<{ install_count: number }>(`SELECT install_count FROM packages WHERE id = 'gh'`);
  assert.equal(install_count, 101);
});

// ---------------- moderation ----------------

test('admin approval makes a package public and verified; hiding clears verification; others are refused', async () => {
  const patch = (user: string | null, visibility: string) =>
    call(pkgRoute.PATCH, { method: 'PATCH', url: '/api/packages/pending-one', body: { visibility }, params: { id: 'pending-one' }, user });
  assert.equal((await patch(null, 'public')).status, 401);
  assert.equal((await patch(PAID, 'public')).status, 403);
  const ok = await patch(ADMIN, 'public');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const [row] = await sql<Record<string, any>>(`SELECT visibility, verified_by, verified_at FROM packages WHERE id = 'pending-one'`);
  assert.equal(row.visibility, 'public');
  assert.equal(row.verified_by, ADMIN);
  assert.ok(row.verified_at);
  const ids = (await service.queryCatalog(service.parseCatalogQuery({ kind: 'mcp' }))).items.map((i) => i.id);
  assert.deepEqual(ids, ['gh', 'pending-one']);
  await patch(ADMIN, 'private');
  const [hidden] = await sql<Record<string, any>>(`SELECT visibility, verified_at FROM packages WHERE id = 'pending-one'`);
  assert.deepEqual(hidden, { visibility: 'private', verified_at: null });
  assert.equal((await patch(ADMIN, 'bogus')).status, 400);
});

test('moderation queue lists packages by visibility with counts', async () => {
  const pending = await service.listModerationQueue('pending');
  assert.deepEqual(pending.items.map((i) => i.id), ['pending-one']);
  assert.deepEqual(pending.counts, { pending: 1, public: 5, private: 1 });
  assert.deepEqual((await service.listModerationQueue('private')).items.map((i) => i.id), ['hidden-one']);
});

test('admins can delete packages; others cannot', async () => {
  const del = (user: string) => call(pkgRoute.DELETE, { method: 'DELETE', url: '/api/packages/rel', params: { id: 'rel' }, user });
  assert.equal((await del(PAID)).status, 403);
  assert.equal((await del(ADMIN)).status, 200);
  assert.equal((await sql(`SELECT id FROM packages WHERE id = 'rel'`)).length, 0);
});

// ---------------- MCP tools share the service ----------------

test('MCP tools discover the new kinds with wire fields and publish them pending', async () => {
  const auth = { userId: API_USER, plan: 'pro' as const };
  const found = (await tools.executeMarketplaceTool('marketplace_discover', { type: 'workflow' }, auth)) as { results: Array<Record<string, unknown>> };
  assert.deepEqual(found.results.map((r) => r.id), ['rel']);
  assert.equal(found.results[0].kind, 'workflow');
  assert.equal(found.results[0].install_url, 'https://blob.example.com/rel.zip');
  const published = await tools.executeMarketplaceTool(
    'marketplace_publish',
    { id: 'mcp-tool-a2a', name: 'Tool Agent', type: 'a2a', config_json: { card_url: 'https://t.example.com/card' }, tags: ['x'] },
    auth,
  );
  assert.deepEqual(published, { ok: true, id: 'mcp-tool-a2a', version: '1.0.0', visibility: 'pending' });
  const typeEnum = (tools.MARKETPLACE_TOOLS.find((t) => t.name === 'marketplace_publish')!.inputSchema.properties.type as { enum: string[] }).enum;
  assert.deepEqual([...typeEnum].sort(), ['a2a', 'mcp', 'plugin', 'practitioner', 'skill', 'subagent', 'workflow']);
});
