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
  /** The Idempotency-Key header, if one was sent. */
  idempotencyKey: string | null;
}

/** A payment intent the fake knows (for GET /v1/payment_intents/:id, refunds and source_transaction). */
export interface FakePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  chargeId: string;
  cardFingerprint?: string | null;
  customerId?: string | null;
  billingEmail?: string | null;
}

export interface FakeStripe {
  url: string;
  requests: RecordedStripeRequest[];
  accounts: Map<string, Record<string, unknown>>;
  paymentIntents: Map<string, FakePaymentIntent>;
  transfers: Map<string, Record<string, unknown>>;
  refunds: Map<string, Record<string, unknown>>;
  /** Register a paid payment intent (and its charge). */
  addPaymentIntent(pi: FakePaymentIntent): void;
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
  const paymentIntents = new Map<string, FakePaymentIntent>();
  const transfers = new Map<string, Record<string, unknown>>();
  const refunds = new Map<string, Record<string, unknown>>();
  // Stripe replays the first response for a repeated Idempotency-Key.
  const idempotent = new Map<string, { status: number; body: unknown }>();
  // A payment intent the test never registered (e.g. one named in a webhook fixture) is made up
  // on first use: a paid intent with a large amount and charge `ch_of_<pi>`.
  const intent = (id: string): FakePaymentIntent => {
    let pi = paymentIntents.get(id);
    if (!pi) {
      pi = { id, amount: 100_000_000, currency: 'eur', chargeId: `ch_of_${id.replace(/^pi_/, '')}` };
      paymentIntents.set(id, pi);
    }
    return pi;
  };
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
      const idempotencyKey = (req.headers['idempotency-key'] as string | undefined) ?? null;
      // Test control (not a Stripe route): every recorded request, oldest first.
      if (method === 'GET' && path === '/__requests') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ requests }));
        return;
      }
      requests.push({ method, path, form, idempotencyKey });

      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json', 'request-id': rid('req') });
        res.end(JSON.stringify(body));
      };
      const send = (status: number, body: unknown) => {
        if (idempotencyKey && method === 'POST' && status < 500) idempotent.set(`${path}|${idempotencyKey}`, { status, body });
        reply(status, body);
      };
      const replay = idempotencyKey && method === 'POST' ? idempotent.get(`${path}|${idempotencyKey}`) : undefined;
      if (replay) return reply(replay.status, replay.body);

      const failure = failures.find((f) => f.remaining > 0 && path.startsWith(f.prefix));
      if (failure) {
        failure.remaining -= 1;
        return reply(400, { error: { type: 'invalid_request_error', message: 'fake stripe failure' } });
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
      if ((m = path.match(/^\/v1\/payment_intents\/(pi_[\w]+)$/)) && method === 'GET') {
        const pi = intent(m[1]);
        const charge = {
          id: pi.chargeId, object: 'charge', amount: pi.amount, currency: pi.currency, customer: pi.customerId ?? null,
          billing_details: { email: pi.billingEmail ?? null },
          payment_method_details: { type: 'card', card: { fingerprint: pi.cardFingerprint ?? null } },
        };
        const expanded = [...url.searchParams.entries()].some(([k, v]) => k.startsWith('expand') && v === 'latest_charge');
        return send(200, {
          id: pi.id, object: 'payment_intent', amount: pi.amount, currency: pi.currency, status: 'succeeded',
          customer: pi.customerId ?? null, latest_charge: expanded ? charge : pi.chargeId,
        });
      }
      if (method === 'POST' && path === '/v1/transfers') {
        const id = rid('tr');
        const transfer = {
          id, object: 'transfer', amount: Number(body.amount), currency: body.currency, destination: body.destination,
          transfer_group: body.transfer_group ?? null, source_transaction: body.source_transaction ?? null,
          metadata: body.metadata ?? {}, amount_reversed: 0, reversed: false,
        };
        transfers.set(id, transfer);
        return send(200, transfer);
      }
      if ((m = path.match(/^\/v1\/transfers\/(tr_[\w]+)\/reversals$/)) && method === 'POST') {
        const transfer = transfers.get(m[1]);
        if (!transfer) return send(404, { error: { type: 'invalid_request_error', message: 'No such transfer' } });
        const amount = body.amount === undefined ? Number(transfer.amount) - Number(transfer.amount_reversed) : Number(body.amount);
        if (amount > Number(transfer.amount) - Number(transfer.amount_reversed)) {
          return send(400, { error: { type: 'invalid_request_error', message: 'Reversal exceeds transfer' } });
        }
        transfer.amount_reversed = Number(transfer.amount_reversed) + amount;
        transfer.reversed = transfer.amount_reversed === transfer.amount;
        return send(200, { id: rid('trr'), object: 'transfer_reversal', amount, transfer: m[1], currency: transfer.currency, metadata: body.metadata ?? {} });
      }
      if (method === 'POST' && path === '/v1/refunds') {
        if (!/^pi_\w+$/.test(String(body.payment_intent))) {
          return send(404, { error: { type: 'invalid_request_error', message: 'No such payment_intent' } });
        }
        const pi = intent(String(body.payment_intent));
        const already = [...refunds.values()].filter((r) => r.payment_intent === pi.id).reduce((s, r) => s + Number(r.amount), 0);
        const amount = body.amount === undefined ? pi.amount - already : Number(body.amount);
        if (amount <= 0 || amount + already > pi.amount) {
          return send(400, { error: { type: 'invalid_request_error', message: 'Refund exceeds charge' } });
        }
        const id = rid('re');
        const refund = { id, object: 'refund', amount, currency: pi.currency, payment_intent: pi.id, charge: pi.chargeId, status: 'succeeded', reason: body.reason ?? null, metadata: body.metadata ?? {} };
        refunds.set(id, refund);
        return send(200, refund);
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
    paymentIntents,
    transfers,
    refunds,
    addPaymentIntent(pi) {
      paymentIntents.set(pi.id, pi);
    },
    sessions,
    failNext(prefix, count = 1) {
      failures.push({ prefix, remaining: count });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
