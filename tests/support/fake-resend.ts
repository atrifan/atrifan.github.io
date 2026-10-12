/**
 * A tiny in-memory stand-in for the Resend API, for tests only. The app points here through
 * RESEND_API_BASE. Never talks to Resend.
 *
 * App-facing endpoints (same shapes as Resend):
 *  - POST /emails                    → records the JSON body, answers `{ id }`
 *  - GET  /emails/receiving/{id}     → a received email added with POST /__received (404 otherwise)
 *
 * Test control:
 *  - GET    /__sent                  → `{ emails: SentEmail[] }` (every POST /emails body, oldest first)
 *  - DELETE /__sent                  → clears the sent list
 *  - POST   /__received              → body is a received email (`{ id, from, to, subject, html, text, headers, message_id, ... }`)
 *  - POST   /__fail                  → body `{ match, status, count }`: the next `count` POST /emails whose raw JSON
 *                                      body contains `match` answer `status` and are not recorded (a transient
 *                                      Resend outage for one test's mail; parallel tests use their own `match`)
 *  - GET    /__attempts?match=       → `{ attempts }`: POST /emails received whose body contains `match`, failed or not
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SentEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  headers?: Record<string, string>;
  /** The Authorization header the app used. */
  authorization: string | null;
  [key: string]: unknown;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  message_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface FakeResend {
  url: string;
  sent: SentEmail[];
  received: Map<string, ReceivedEmail>;
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function startFakeResend(port = 0): Promise<FakeResend> {
  const sent: SentEmail[] = [];
  const received = new Map<string, ReceivedEmail>();
  const failures: Array<{ match: string; status: number; remaining: number }> = [];
  const attemptBodies: string[] = [];

  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://fake-resend.local');
      const method = req.method ?? 'GET';
      if (method === 'POST' && url.pathname === '/emails') {
        const raw = (await readBody(req)) || '{}';
        attemptBodies.push(raw);
        const failure = failures.find((f) => f.remaining > 0 && raw.includes(f.match));
        if (failure) {
          failure.remaining -= 1;
          return send(res, failure.status, { statusCode: failure.status, name: 'fake_failure', message: `fake Resend answered ${failure.status}` });
        }
        const body = JSON.parse(raw) as Record<string, unknown>;
        const id = randomUUID();
        sent.push({ ...(body as Omit<SentEmail, 'id' | 'authorization'>), id, authorization: req.headers.authorization ?? null } as SentEmail);
        return send(res, 200, { id });
      }
      const recv = /^\/emails\/receiving\/([^/]+)$/.exec(url.pathname);
      if (method === 'GET' && recv) {
        const email = received.get(decodeURIComponent(recv[1]));
        if (!email) return send(res, 404, { statusCode: 404, name: 'not_found', message: 'Email not found' });
        return send(res, 200, { object: 'email', html_format: url.searchParams.get('html_format') ?? 'data_uri', attachments: [], cc: [], bcc: [], reply_to: [], ...email });
      }
      if (url.pathname === '/__sent' && method === 'GET') return send(res, 200, { emails: sent });
      if (url.pathname === '/__sent' && method === 'DELETE') {
        sent.length = 0;
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/__fail' && method === 'POST') {
        const { match, status, count } = JSON.parse((await readBody(req)) || '{}') as { match?: unknown; status?: unknown; count?: unknown };
        if (typeof match !== 'string' || !match || !Number.isInteger(status) || !Number.isInteger(count) || (count as number) < 1) {
          return send(res, 400, { error: 'match (string), status and count (>= 1) required' });
        }
        failures.push({ match, status: status as number, remaining: count as number });
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/__attempts' && method === 'GET') {
        const match = url.searchParams.get('match') ?? '';
        return send(res, 200, { attempts: attemptBodies.filter((b) => b.includes(match)).length });
      }
      if (url.pathname === '/__received' && method === 'POST') {
        const email = JSON.parse((await readBody(req)) || '{}') as ReceivedEmail;
        if (!email.id) return send(res, 400, { error: 'id required' });
        received.set(email.id, email);
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  // Specs wait 6s (QUIET_MS) between calls; with Node's 5s default the server closes the idle keep-alive
  // socket just before the client reuses it, and that call fails with "socket hang up" / ECONNRESET.
  server.keepAliveTimeout = 30_000;

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${actual}`,
    sent,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
