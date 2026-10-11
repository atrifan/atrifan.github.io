import { test, expect, type APIResponse } from '@playwright/test';
import crypto from 'crypto';
import { Pool } from 'pg';

// Behavior-only contract tests for the public one-click unsubscribe endpoint.
//
//   GET  /api/notifications/unsubscribe?token=...  → 200 text/html "unsubscribed" | 400
//   POST /api/notifications/unsubscribe            → 200 { unsubscribed: true, type } | 400 { error }
//        (RFC 8058: body List-Unsubscribe=One-Click; token in query or `token` form field)
//
// Token-dependent tests skip without NOTIFY_UNSUBSCRIBE_SECRET. DB assertions
// skip without STORAGE_POSTGRES_URL_NON_POOLING + NOTIFY_DB_SCHEMA. Every test
// uses its own fresh user id, and rows for those ids are deleted afterwards.

const URL_PATH = '/api/notifications/unsubscribe';
const SECRET = process.env.NOTIFY_UNSUBSCRIBE_SECRET;
const DB_URL = process.env.STORAGE_POSTGRES_URL_NON_POOLING;
const SCHEMA = process.env.NOTIFY_DB_SCHEMA;

const hasSecret = !!SECRET;
const hasDb = !!(DB_URL && SCHEMA);

// ---------------------------------------------------------------------------
// Token helpers (format from the contract)
// ---------------------------------------------------------------------------
function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString('base64url');
}

function segFor(payload: unknown): string {
  return b64url(JSON.stringify(payload));
}

function sign(seg: string, key: string): string {
  return crypto.createHmac('sha256', key).update(seg).digest('base64url');
}

function makeToken(userId: string, type: string, key: string = SECRET!): string {
  const seg = segFor({ u: userId, t: type, v: 1 });
  return `${seg}.${sign(seg, key)}`;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
let pool: Pool | undefined;

function db(): Pool {
  if (!pool) {
    const url = new URL(DB_URL!);
    url.searchParams.delete('sslmode');
    pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 2 });
  }
  return pool;
}

const table = () => `"${SCHEMA}".notification_preferences`;

type PrefRow = { type: string; email_enabled: boolean };

async function rowsFor(userId: string): Promise<PrefRow[]> {
  const { rows } = await db().query<PrefRow>(
    `select type, email_enabled from ${table()} where user_id = $1 order by type`,
    [userId]
  );
  return rows;
}

// Fresh, unique user id per call; tracked for cleanup.
const createdUsers: string[] = [];
function freshUser(): string {
  const id = `contract_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  createdUsers.push(id);
  return id;
}

test.afterEach(async () => {
  const ids = createdUsers.splice(0);
  if (hasDb && ids.length) {
    await db().query(`delete from ${table()} where user_id = any($1::text[])`, [ids]);
  }
});

test.afterAll(async () => {
  if (pool) await pool.end();
  pool = undefined;
});

const ONE_CLICK = { 'List-Unsubscribe': 'One-Click' };

// ---------------------------------------------------------------------------
// GET — valid token
// ---------------------------------------------------------------------------
test.describe('GET unsubscribe with a valid token', () => {
  test.beforeEach(() => {
    test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
  });

  test('→ 200 text/html saying "unsubscribed", not cacheable', async ({ request }) => {
    const res = await request.get(`${URL_PATH}?token=${encodeURIComponent(makeToken(freshUser(), 'bid_received'))}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toMatch(/text\/html/i);
    expect(await res.text()).toMatch(/unsubscribed/i);
    expect(res.headers()['cache-control'] ?? '').toMatch(/no-store/i);
  });

  test('repeating the same GET is idempotent → 200 again', async ({ request }) => {
    const url = `${URL_PATH}?token=${encodeURIComponent(makeToken(freshUser(), 'payout_sent'))}`;
    const first = await request.get(url);
    expect(first.status()).toBe(200);
    const second = await request.get(url);
    expect(second.status()).toBe(200);
    expect(await second.text()).toMatch(/unsubscribed/i);
  });
});

test.describe('GET unsubscribe with a valid token (DB effects)', () => {
  test.beforeEach(() => {
    test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
    test.skip(!hasDb, 'requires STORAGE_POSTGRES_URL_NON_POOLING and NOTIFY_DB_SCHEMA');
  });

  test('writes email_enabled=false for exactly that (user, type)', async ({ request }) => {
    const user = freshUser();
    const res = await request.get(`${URL_PATH}?token=${encodeURIComponent(makeToken(user, 'qa_verdict'))}`);
    expect(res.status()).toBe(200);
    expect(await rowsFor(user)).toEqual([{ type: 'qa_verdict', email_enabled: false }]);
  });

  test('leaves other types for the same user unaffected', async ({ request }) => {
    const user = freshUser();
    // An explicitly-enabled row for another type must stay enabled.
    await db().query(
      `insert into ${table()} (user_id, type, email_enabled) values ($1, 'job_posted', true)`,
      [user]
    );
    const res = await request.get(`${URL_PATH}?token=${encodeURIComponent(makeToken(user, 'dispute_opened'))}`);
    expect(res.status()).toBe(200);

    const rows = await rowsFor(user);
    expect(rows.find((r) => r.type === 'dispute_opened')?.email_enabled).toBe(false);
    expect(rows.find((r) => r.type === 'job_posted')?.email_enabled).toBe(true);
    // Nothing else was turned off.
    expect(rows.filter((r) => r.type !== 'dispute_opened').every((r) => r.email_enabled)).toBe(true);
  });

  test('repeated GET keeps a single disabled row', async ({ request }) => {
    const user = freshUser();
    const url = `${URL_PATH}?token=${encodeURIComponent(makeToken(user, 'review_received'))}`;
    expect((await request.get(url)).status()).toBe(200);
    expect((await request.get(url)).status()).toBe(200);
    expect(await rowsFor(user)).toEqual([{ type: 'review_received', email_enabled: false }]);
  });
});

// ---------------------------------------------------------------------------
// GET — invalid tokens → 400
// ---------------------------------------------------------------------------
test.describe('GET unsubscribe with a missing or malformed token', () => {
  test('no token → 400', async ({ request }) => {
    const res = await request.get(URL_PATH);
    expect(res.status()).toBe(400);
  });

  test('empty token → 400', async ({ request }) => {
    const res = await request.get(`${URL_PATH}?token=`);
    expect(res.status()).toBe(400);
  });

  for (const [name, token] of [
    ['no dot separator', 'notatoken'],
    ['three segments', 'a.b.c'],
    ['non-base64 garbage', '!!!.???'],
    ['non-JSON payload', `${b64url('not json')}.${b64url('sig')}`],
  ] as const) {
    test(`malformed token (${name}) → 400`, async ({ request }) => {
      const res = await request.get(`${URL_PATH}?token=${encodeURIComponent(token)}`);
      expect(res.status()).toBe(400);
    });
  }
});

// Tamper cases need the real secret to build the "nearly valid" token.
type Tamper = { name: string; build: () => { token: string; users: string[] } };

const TAMPERS: Tamper[] = [
  {
    name: 'altered payload (different user id, old signature)',
    build: () => {
      const original = freshUser();
      const attacker = freshUser();
      const [, sig] = makeToken(original, 'bid_received').split('.');
      const forgedSeg = segFor({ u: attacker, t: 'bid_received', v: 1 });
      return { token: `${forgedSeg}.${sig}`, users: [original, attacker] };
    },
  },
  {
    name: 'altered payload (different type, old signature)',
    build: () => {
      const user = freshUser();
      const [, sig] = makeToken(user, 'bid_received').split('.');
      return { token: `${segFor({ u: user, t: 'payout_sent', v: 1 })}.${sig}`, users: [user] };
    },
  },
  {
    name: 'signed with a different secret',
    build: () => {
      const user = freshUser();
      return { token: makeToken(user, 'bid_received', `${SECRET}-wrong`), users: [user] };
    },
  },
  {
    name: 'garbage signature',
    build: () => {
      const user = freshUser();
      const [seg] = makeToken(user, 'bid_received').split('.');
      return { token: `${seg}.${b64url(crypto.randomBytes(32))}`, users: [user] };
    },
  },
  {
    name: 'missing signature',
    build: () => {
      const user = freshUser();
      const [seg] = makeToken(user, 'bid_received').split('.');
      return { token: `${seg}.`, users: [user] };
    },
  },
  {
    name: 'correctly signed but unknown type',
    build: () => {
      const user = freshUser();
      return { token: makeToken(user, 'not_a_real_type'), users: [user] };
    },
  },
];

test.describe('GET unsubscribe with a tampered token', () => {
  test.beforeEach(() => {
    test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
  });

  for (const t of TAMPERS) {
    test(`${t.name} → 400`, async ({ request }) => {
      const { token } = t.build();
      const res = await request.get(`${URL_PATH}?token=${encodeURIComponent(token)}`);
      expect(res.status()).toBe(400);
    });
  }
});

test.describe('GET unsubscribe with a tampered token (DB effects)', () => {
  test.beforeEach(() => {
    test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
    test.skip(!hasDb, 'requires STORAGE_POSTGRES_URL_NON_POOLING and NOTIFY_DB_SCHEMA');
  });

  for (const t of TAMPERS) {
    test(`${t.name} → no preference row written`, async ({ request }) => {
      const { token, users } = t.build();
      const res = await request.get(`${URL_PATH}?token=${encodeURIComponent(token)}`);
      expect(res.status()).toBe(400);
      for (const u of users) expect(await rowsFor(u)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// POST — RFC 8058 one-click
// ---------------------------------------------------------------------------
test.describe('POST one-click unsubscribe with a valid token', () => {
  test.beforeEach(() => {
    test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
  });

  test('token in query → 200 { unsubscribed: true, type }', async ({ request }) => {
    const res = await request.post(
      `${URL_PATH}?token=${encodeURIComponent(makeToken(freshUser(), 'contract_created'))}`,
      { form: ONE_CLICK }
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toMatch(/application\/json/i);
    expect(await res.json()).toMatchObject({ unsubscribed: true, type: 'contract_created' });
  });

  test('token as a `token` form field → 200 { unsubscribed: true, type }', async ({ request }) => {
    const res = await request.post(URL_PATH, {
      form: { ...ONE_CLICK, token: makeToken(freshUser(), 'delivery_ready') },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ unsubscribed: true, type: 'delivery_ready' });
  });
});

test.describe('POST one-click unsubscribe with a valid token (DB effects)', () => {
  test.beforeEach(() => {
    test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
    test.skip(!hasDb, 'requires STORAGE_POSTGRES_URL_NON_POOLING and NOTIFY_DB_SCHEMA');
  });

  test('token in query → row email_enabled=false', async ({ request }) => {
    const user = freshUser();
    const res = await request.post(
      `${URL_PATH}?token=${encodeURIComponent(makeToken(user, 'payment_confirmed'))}`,
      { form: ONE_CLICK }
    );
    expect(res.status()).toBe(200);
    expect(await rowsFor(user)).toEqual([{ type: 'payment_confirmed', email_enabled: false }]);
  });

  test('token in form field → row email_enabled=false', async ({ request }) => {
    const user = freshUser();
    const res = await request.post(URL_PATH, {
      form: { ...ONE_CLICK, token: makeToken(user, 'auto_accept_reminder') },
    });
    expect(res.status()).toBe(200);
    expect(await rowsFor(user)).toEqual([{ type: 'auto_accept_reminder', email_enabled: false }]);
  });
});

test.describe('POST one-click unsubscribe with an invalid token', () => {
  async function expect400Json(res: APIResponse) {
    expect(res.status()).toBe(400);
    expect(res.headers()['content-type'] ?? '').toMatch(/application\/json/i);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  }

  test('no token anywhere → 400 { error }', async ({ request }) => {
    await expect400Json(await request.post(URL_PATH, { form: ONE_CLICK }));
  });

  test('malformed token in query → 400 { error }', async ({ request }) => {
    await expect400Json(await request.post(`${URL_PATH}?token=notatoken`, { form: ONE_CLICK }));
  });

  test('malformed token in form field → 400 { error }', async ({ request }) => {
    await expect400Json(await request.post(URL_PATH, { form: { ...ONE_CLICK, token: 'a.b.c' } }));
  });

  test.describe('tampered', () => {
    test.beforeEach(() => {
      test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
    });

    for (const t of TAMPERS) {
      test(`${t.name} → 400 { error }`, async ({ request }) => {
        const { token } = t.build();
        await expect400Json(
          await request.post(`${URL_PATH}?token=${encodeURIComponent(token)}`, { form: ONE_CLICK })
        );
      });
    }
  });

  test.describe('tampered (DB effects)', () => {
    test.beforeEach(() => {
      test.skip(!hasSecret, 'requires NOTIFY_UNSUBSCRIBE_SECRET');
      test.skip(!hasDb, 'requires STORAGE_POSTGRES_URL_NON_POOLING and NOTIFY_DB_SCHEMA');
    });

    for (const t of TAMPERS) {
      test(`${t.name} → no preference row written`, async ({ request }) => {
        const { token, users } = t.build();
        const res = await request.post(URL_PATH, { form: { ...ONE_CLICK, token } });
        expect(res.status()).toBe(400);
        for (const u of users) expect(await rowsFor(u)).toEqual([]);
      });
    }
  });
});
