/**
 * Test seed helpers.
 *
 * Marketplace discovery/publish/install are gated by a Tulzo API key (Bearer),
 * not by Clerk. To exercise those routes we seed a real `api_keys` row whose
 * hash matches a known plaintext test key, on a paid plan.
 *
 * Requires STORAGE_SUPABASE_URL + STORAGE_SUPABASE_SERVICE_ROLE_KEY in the env
 * (same vars the app uses). Skips gracefully if they're absent so the suite can
 * still run partial checks locally.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const TEST_PRO_KEY = process.env.TEST_MARKETPLACE_KEY || 'tlz_test_pro_marketplace_key_0001';
export const TEST_USER_ID = process.env.TEST_MARKETPLACE_USER || 'test_user_marketplace';
export const TEST_PACKAGE_ID = 'test-mcp-weather';

// Remote chat relay fixtures. A relay session is normally created via the
// Clerk-gated route; for device-side (Bearer) tests we seed one directly so
// poll/emit can be exercised with the fixture API key alone.
export const TEST_RELAY_SESSION_ID = '00000000-0000-4000-8000-00000000c0de';
export const TEST_RELAY_DEVICE_NAME = 'e2e';

function hash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function hasSupabaseEnv(): boolean {
  return !!(
    (process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL) &&
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY
  );
}

function client(): SupabaseClient {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Insert (or refresh) the paid fixture API key and a public fixture package. */
export async function seedMarketplace(): Promise<void> {
  const db = client();

  await db.from('api_keys').upsert(
    {
      user_id: TEST_USER_ID,
      api_key_hash: hash(TEST_PRO_KEY),
      api_key_suffix: TEST_PRO_KEY.slice(-4),
      name: 'e2e-marketplace',
      server_name: 'default',
      device_name: 'e2e',
      provider: 'custom',
      plan: 'pro',
      is_active: true,
    },
    { onConflict: 'api_key_hash' }
  );

  await db.from('packages').upsert({
    id: TEST_PACKAGE_ID,
    name: 'Test Weather MCP',
    description: 'Fixture MCP package for e2e tests',
    type: 'mcp',
    latest_version: '1.0.0',
    blob_url: '',
    visibility: 'public',
    config_json: { transport: 'http', url: 'https://example.com/mcp' },
    created_by: TEST_USER_ID,
    owner_user_id: TEST_USER_ID,
  });
}

/** Remove fixtures created by seedMarketplace. */
export async function cleanupMarketplace(): Promise<void> {
  const db = client();
  await db.from('packages').delete().eq('id', TEST_PACKAGE_ID);
  await db.from('api_keys').delete().eq('api_key_hash', hash(TEST_PRO_KEY));
}

/**
 * Seed a relay session owned by the fixture user + fixture device (api key),
 * so device Bearer routes (poll/emit) can be tested without Clerk. Requires the
 * fixture api_keys row to exist (seedMarketplace runs first in global-setup).
 * Idempotent: upserts by fixed session id and clears any leftover frames.
 */
export async function seedRelaySession(): Promise<void> {
  const db = client();
  const { data: key } = await db
    .from('api_keys')
    .select('id')
    .eq('api_key_hash', hash(TEST_PRO_KEY))
    .single();
  if (!key) return;

  await db.from('chat_relay_sessions').upsert(
    {
      id: TEST_RELAY_SESSION_ID,
      user_id: TEST_USER_ID,
      api_key_id: (key as { id: string }).id,
      device_name: TEST_RELAY_DEVICE_NAME,
      title: 'e2e relay session',
    },
    { onConflict: 'id' }
  );

  // Start each run with a clean frame/message slate for this session.
  await db.from('chat_relay_frames').delete().eq('session_id', TEST_RELAY_SESSION_ID);
  await db.from('chat_relay_messages').delete().eq('session_id', TEST_RELAY_SESSION_ID);
}

// ============ Marketplace catalog fixtures (marketplace surface UI) ============
//
// A small, deterministic catalog for the marketplace pages: fixed ids, dates, install counts and
// ratings, so specs and screenshots don't drift. Seeded by scripts/test-e2e-marketplace.ts into
// its throwaway DB (never the shared project). Ids start with `fx-`.

export interface CatalogFixture {
  id: string;
  name: string;
  type: 'mcp' | 'skill' | 'plugin' | 'a2a' | 'subagent' | 'workflow';
  description: string;
  long_description?: string;
  publisher_name: string;
  category: string;
  tags: string[];
  install_count: number;
  latest_version: string;
  versions?: string[];
  visibility: 'public' | 'pending' | 'private';
  verified: boolean;
  created_at: string;
  blob_url?: string;
  config_json?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  ratings?: Array<{ rating: number; review?: string }>;
}

const FX_OWNER = 'fx_publisher_user';

export const CATALOG_FIXTURES: CatalogFixture[] = [
  {
    id: 'fx-github-mcp',
    name: 'GitHub Tools',
    type: 'mcp',
    description: 'Search issues, review pull requests and manage repositories from your assistant.',
    long_description:
      'GitHub Tools connects your assistant to **GitHub**.\n\n- List and triage issues\n- Open pull requests\n\n' +
      '<script>window.__fxInjected = true</script>\n\n[Unsafe link](javascript:alert(1))',
    publisher_name: 'Tulzo Labs',
    category: 'developer-tools',
    tags: ['github', 'git'],
    install_count: 1520,
    latest_version: '2.1.0',
    versions: ['2.0.0', '2.1.0'],
    visibility: 'public',
    verified: true,
    created_at: '2026-09-01T10:00:00Z',
    config_json: {
      transport: 'http',
      url: 'https://mcp.example.com/github',
      tools: [
        { name: 'list_issues', description: 'List issues in a repository' },
        { name: 'create_pull_request', description: 'Open a pull request' },
      ],
    },
    ratings: [
      { rating: 5, review: 'Saves me an hour a day.' },
      { rating: 4, review: 'Solid, wish it did projects too.' },
    ],
  },
  {
    id: 'fx-pdf-skill',
    name: 'PDF Summarizer',
    type: 'skill',
    description: 'Summarise long PDFs into key points, quotes and action items.',
    publisher_name: 'Doc Wizards',
    category: 'productivity',
    tags: ['pdf', 'documents'],
    install_count: 860,
    latest_version: '1.2.0',
    versions: ['1.0.0', '1.1.0', '1.2.0'],
    visibility: 'public',
    verified: true,
    created_at: '2026-08-15T10:00:00Z',
    blob_url: 'https://blob.example.com/packages/fx-pdf-skill/1.2.0.zip',
    ratings: [{ rating: 5, review: 'Exactly what I needed.' }, { rating: 5 }],
  },
  {
    id: 'fx-slack-plugin',
    name: 'Slack Notifier',
    type: 'plugin',
    description: 'Post updates and alerts to Slack channels when your tasks finish.',
    publisher_name: 'Chatty Co',
    category: 'communication',
    tags: ['slack', 'chat'],
    install_count: 430,
    latest_version: '0.9.1',
    visibility: 'public',
    verified: true,
    created_at: '2026-07-20T10:00:00Z',
    blob_url: 'https://blob.example.com/packages/fx-slack-plugin/0.9.1.zip',
    ratings: [{ rating: 3, review: 'Works, setup was fiddly.' }],
  },
  {
    id: 'fx-travel-a2a',
    name: 'Travel Planner Agent',
    type: 'a2a',
    description: 'An A2A agent that plans trips, compares flights and books hotels.',
    publisher_name: 'Wander AI',
    category: 'productivity',
    tags: ['travel'],
    install_count: 75,
    latest_version: '1.0.0',
    visibility: 'public',
    verified: false,
    created_at: '2026-09-20T10:00:00Z',
    config_json: { card_url: 'https://agents.example.com/travel/.well-known/agent-card.json' },
  },
  {
    id: 'fx-code-reviewer',
    name: 'Code Reviewer',
    type: 'subagent',
    description: 'A focused sub-agent that reviews diffs for bugs, style and missing tests.',
    publisher_name: 'Tulzo Labs',
    category: 'developer-tools',
    tags: ['review', 'github'],
    install_count: 210,
    latest_version: '1.0.0',
    visibility: 'public',
    verified: true,
    created_at: '2026-09-25T10:00:00Z',
    blob_url: 'https://blob.example.com/packages/fx-code-reviewer/1.0.0.zip',
    provenance: { translated_from: 'claude-code:code-reviewer' },
    ratings: [{ rating: 4, review: 'Catches real bugs.' }],
  },
  {
    id: 'fx-release-workflow',
    name: 'Release Workflow',
    type: 'workflow',
    description: 'Tag, build and publish a release with changelog notes in one run.',
    publisher_name: 'Ship It',
    category: 'developer-tools',
    tags: ['release', 'ci'],
    install_count: 40,
    latest_version: '1.0.0',
    visibility: 'public',
    verified: true,
    created_at: '2026-10-01T10:00:00Z',
    blob_url: 'https://blob.example.com/packages/fx-release-workflow/1.0.0.zip',
  },
  // Seven small skills so the catalog has two pages (12 per page).
  ...['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'].map(
    (word, i): CatalogFixture => ({
      id: `fx-sample-${word.toLowerCase()}`,
      name: `Sample ${word}`,
      type: 'skill',
      description: `A sample skill (${word.toLowerCase()}) used to fill the catalog.`,
      publisher_name: 'Sample Studio',
      category: 'research',
      tags: ['sample'],
      install_count: 7 - i,
      latest_version: '0.1.0',
      visibility: 'public',
      verified: false,
      created_at: `2026-06-0${i + 1}T10:00:00Z`,
      blob_url: `https://blob.example.com/packages/fx-sample-${word.toLowerCase()}/0.1.0.zip`,
    }),
  ),
  {
    id: 'fx-pending-mcp',
    name: 'Pending Weather MCP',
    type: 'mcp',
    description: 'Forecasts and alerts. Waiting for review.',
    publisher_name: 'Cloud Nine',
    category: 'data',
    tags: ['weather'],
    install_count: 0,
    latest_version: '0.1.0',
    visibility: 'pending',
    verified: false,
    created_at: '2026-10-05T10:00:00Z',
    config_json: { transport: 'sse', url: 'https://weather.example.com/sse' },
  },
  {
    id: 'fx-hidden-skill',
    name: 'Hidden Skill',
    type: 'skill',
    description: 'Hidden by an admin.',
    publisher_name: 'Sample Studio',
    category: 'other',
    tags: [],
    install_count: 3,
    latest_version: '0.1.0',
    visibility: 'private',
    verified: false,
    created_at: '2026-05-01T10:00:00Z',
    blob_url: 'https://blob.example.com/packages/fx-hidden-skill/0.1.0.zip',
  },
];

/** Remove every `fx-` package (and, by cascade, its versions, ratings and installs). */
export async function resetMarketplaceCatalog(): Promise<void> {
  const db = client();
  const { error } = await db.from('packages').delete().like('id', 'fx-%');
  if (error) throw new Error(`reset catalog: ${error.message}`);
}

/** Insert the deterministic catalog. Needs the 20261205 marketplace migration. */
export async function seedMarketplaceCatalog(): Promise<void> {
  const db = client();
  await resetMarketplaceCatalog();
  for (const f of CATALOG_FIXTURES) {
    const { error } = await db.from('packages').insert({
      id: f.id,
      name: f.name,
      description: f.description,
      long_description: f.long_description ?? null,
      type: f.type,
      latest_version: f.latest_version,
      blob_url: f.blob_url ?? '',
      config_json: f.config_json ?? null,
      created_by: FX_OWNER,
      owner_user_id: FX_OWNER,
      publisher_name: f.publisher_name,
      category: f.category,
      tags: f.tags,
      install_count: f.install_count,
      visibility: f.visibility,
      verified_at: f.verified ? f.created_at : null,
      verified_by: f.verified ? 'fx_admin' : null,
      provenance: f.provenance ?? null,
      files_hash: `sha256:${f.id}-${f.latest_version}`,
      created_at: f.created_at,
      updated_at: f.created_at,
    });
    if (error) throw new Error(`seed ${f.id}: ${error.message}`);
    const versions = f.versions ?? [f.latest_version];
    for (const [i, v] of versions.entries()) {
      const at = new Date(Date.parse(f.created_at) + i * 86_400_000).toISOString();
      const { error: vErr } = await db.from('package_versions').insert({
        package_id: f.id,
        version: v,
        blob_url: f.blob_url ? f.blob_url.replace(f.latest_version, v) : '',
        changelog: i === 0 ? 'First release' : `Improvements in ${v}`,
        created_at: at,
      });
      if (vErr) throw new Error(`seed ${f.id}@${v}: ${vErr.message}`);
    }
    for (const [i, r] of (f.ratings ?? []).entries()) {
      const { error: rErr } = await db.from('package_ratings').insert({
        package_id: f.id,
        user_id: `fx_rater_${i + 1}`,
        rating: r.rating,
        review: r.review ?? null,
        created_at: new Date(Date.parse(f.created_at) + (i + 1) * 3_600_000).toISOString(),
      });
      if (rErr) throw new Error(`seed rating ${f.id}: ${rErr.message}`);
    }
  }
}
