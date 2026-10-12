/**
 * A tiny in-memory stand-in for the Stripe API, for tests only. The app's Stripe client
 * points here through STRIPE_API_BASE. Records every request so tests can assert on what
 * was sent (e.g. the Checkout line item amount). Never talks to Stripe.
 */
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

export interface RecordedStripeRequest {
  method: string;
  path: string;
  form: Record<string, string>;
}

export interface FakeStripe {
  url: string;
  requests: RecordedStripeRequest[];
  accounts: Map<string, Record<string, unknown>>;
  /** Checkout sessions created through the fake, by id (status open | expired | complete). */
  sessions: Map<string, Record<string, unknown>>;
  /** Make the next N requests to a path prefix fail with a Stripe API error. */
  failNext(pathPrefix: string, count?: number): void;
  close(): Promise<void>;
}

function rid(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** Turn `a[b][0][c]=1` form keys into a nested object (enough for our assertions). */
export function formToObject(form: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    const parts = key.replace(/\]/g, '').split('[');
    let node: Record<string, unknown> = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = value;
      } else {
        node[part] = (node[part] as Record<string, unknown>) ?? {};
        node = node[part] as Record<string, unknown>;
      }
    });
  }
  return root;
}

export async function startFakeStripe(): Promise<FakeStripe> {
  const requests: RecordedStripeRequest[] = [];
  const accounts = new Map<string, Record<string, unknown>>();
  const sessions = new Map<string, Record<string, unknown>>();
  const failures: Array<{ prefix: string; remaining: number }> = [];

  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url || '/', 'http://fake');
      const form: Record<string, string> = {};
      new URLSearchParams(raw).forEach((v, k) => (form[k] = v));
      const method = req.method || 'GET';
      const path = url.pathname;
      requests.push({ method, path, form });

      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json', 'request-id': rid('req') });
        res.end(JSON.stringify(body));
      };

      const failure = failures.find((f) => f.remaining > 0 && path.startsWith(f.prefix));
      if (failure) {
        failure.remaining -= 1;
        return send(400, { error: { type: 'invalid_request_error', message: 'fake stripe failure' } });
      }

      const body = formToObject(form);
      let m: RegExpMatchArray | null;

      if (method === 'POST' && path === '/v1/accounts') {
        const id = rid('acct_test');
        const acct = {
          id, object: 'account', type: body.type ?? 'express', country: body.country ?? null,
          email: body.email ?? null, metadata: body.metadata ?? {},
          payouts_enabled: false, charges_enabled: false, details_submitted: false,
          requirements: { disabled_reason: null, currently_due: ['external_account'] },
        };
        accounts.set(id, acct);
        return send(200, acct);
      }
      if ((m = path.match(/^\/v1\/accounts\/(acct_[\w]+)$/)) && method === 'GET') {
        const acct = accounts.get(m[1]);
        return acct ? send(200, acct) : send(404, { error: { type: 'invalid_request_error', message: 'No such account' } });
      }
      if ((m = path.match(/^\/v1\/accounts\/(acct_[\w]+)\/login_links$/)) && method === 'POST') {
        return send(200, { object: 'login_link', url: `https://connect.stripe.com/express/${rid('ll')}`, created: 1 });
      }
      if (method === 'POST' && path === '/v1/account_links') {
        return send(200, {
          object: 'account_link', created: 1, expires_at: 9999999999,
          url: `https://connect.stripe.com/setup/e/${String(body.account)}/${rid('al')}`,
        });
      }
      if (method === 'POST' && path === '/v1/checkout/sessions') {
        const id = rid('cs_test');
        const items = (body.line_items as Record<string, Record<string, Record<string, string>>>) ?? {};
        let total = 0;
        for (const item of Object.values(items)) {
          total += Number(item.price_data?.unit_amount ?? 0) * Number((item as unknown as { quantity?: string }).quantity ?? 1);
        }
        const session = {
          id, object: 'checkout.session', mode: body.mode, status: 'open', payment_status: 'unpaid',
          amount_total: total, currency: (Object.values(items)[0]?.price_data?.currency as string) ?? 'eur',
          metadata: body.metadata ?? {}, url: `https://checkout.stripe.com/c/pay/${id}`,
        };
        sessions.set(id, session);
        return send(200, session);
      }
      if ((m = path.match(/^\/v1\/checkout\/sessions\/(cs_[\w]+)\/expire$/)) && method === 'POST') {
        const known = sessions.get(m[1]);
        if (known) Object.assign(known, { status: 'expired', url: null });
        return send(200, { id: m[1], object: 'checkout.session', status: 'expired' });
      }
      if ((m = path.match(/^\/v1\/checkout\/sessions\/(cs_[\w]+)$/)) && method === 'GET') {
        // Sessions the fake never created read as expired (e.g. ids invented by a test's webhook).
        return send(200, sessions.get(m[1]) ?? { id: m[1], object: 'checkout.session', status: 'expired', url: null });
      }
      if (method === 'POST' && path === '/v1/refunds') {
        return send(200, {
          id: rid('re_test'), object: 'refund', amount: Number(body.amount ?? 0), currency: 'eur',
          payment_intent: body.payment_intent ?? null, status: 'succeeded', reason: body.reason ?? null,
          metadata: body.metadata ?? {},
        });
      }
      return send(404, { error: { type: 'invalid_request_error', message: `fake stripe: no route ${method} ${path}` } });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    accounts,
    sessions,
    failNext(prefix, count = 1) {
      failures.push({ prefix, remaining: count });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
