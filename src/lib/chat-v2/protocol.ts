import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { invalid, RelayError, unauthorized } from './http';

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const iso = z.string().refine((value) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const common = { v: z.literal(2), userId: z.string().min(1).max(256), deviceId: uuid, streamId: uuid, clientId: uuid, iat: z.number().int().safe(), exp: z.number().int().safe(), nonce: uuid };
const viewerClaims = z.object({ ...common, aud: z.literal('viewer'), viewerSessionId: z.string().min(1).max(256) }).strict();
const deviceClaims = z.object({ ...common, aud: z.literal('device'), connectionId: uuid }).strict();
export type ViewerClaims = z.infer<typeof viewerClaims>;
export type DeviceClaims = z.infer<typeof deviceClaims>;

export function tokenSecret(): string {
  const secret = process.env.CHAT_RELAY_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || !/^[A-Za-z0-9_-]+$/.test(secret)) throw new RelayError(500, 'server_misconfigured');
  return secret;
}

export function issueToken(claims: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifyToken(token: unknown, audience: 'viewer', secret: string): ViewerClaims;
export function verifyToken(token: unknown, audience: 'device', secret: string): DeviceClaims;
export function verifyToken(token: unknown, audience: 'viewer' | 'device', secret: string): ViewerClaims | DeviceClaims {
  if (typeof token !== 'string' || token.length > 4096) return unauthorized();
  const segments = token.split('.');
  if (segments.length !== 2 || !segments.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return unauthorized();
  const signature = Buffer.from(segments[1], 'base64url');
  const expected = createHmac('sha256', secret).update(segments[0]).digest();
  if (signature.length !== expected.length || signature.toString('base64url') !== segments[1] || !timingSafeEqual(signature, expected)) return unauthorized();
  let payload: unknown;
  try {
    const raw = Buffer.from(segments[0], 'base64url');
    if (raw.toString('base64url') !== segments[0]) return unauthorized();
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch { return unauthorized(); }
  const parsed = (audience === 'viewer' ? viewerClaims : deviceClaims).safeParse(payload);
  if (!parsed.success) return unauthorized();
  const claims = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp !== claims.iat + 45 || claims.iat > now + 2 || claims.exp <= now) return unauthorized();
  if (claims.aud === 'device' && claims.clientId !== claims.connectionId) return unauthorized();
  return claims;
}

const cursor = z.string().max(2048).nullable();
const text = z.string().refine((s) => s.trim().length > 0 && Buffer.byteLength(s) <= 32768);
const command = z.union([
  z.object({ kind: z.literal('reply'), text }).strict(),
  z.object({ kind: z.literal('stop'), loopId: uuid }).strict(),
  z.object({ kind: z.literal('answer'), requestId: uuid, text }).strict(),
  z.object({ kind: z.literal('answer'), requestId: uuid, decision: z.enum(['approve', 'deny']) }).strict(),
]);
const op = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello') }).strict(),
  z.object({ kind: z.literal('catalog.list'), scope: z.enum(['history', 'active']), cursor, limit: z.number().int().min(1).max(50) }).strict(),
  z.object({ kind: z.literal('session.create'), commandId: uuid }).strict(),
  z.object({ kind: z.literal('history.read'), sessionId: uuid, cursor, limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('watch.attach'), sessionId: uuid, watchId: uuid }).strict(),
  z.object({ kind: z.literal('watch.renew'), sessionId: uuid, watchId: uuid }).strict(),
  z.object({ kind: z.literal('watch.detach'), sessionId: uuid, watchId: uuid }).strict(),
  z.object({ kind: z.literal('command'), sessionId: uuid, watchId: uuid, commandId: uuid, stateVersion: uuid, command }).strict(),
  z.object({ kind: z.literal('request.cancel'), targetRequestId: uuid }).strict(),
]);
const requestSchema = z.object({ requestId: uuid, expiresAt: iso, connectionId: uuid.optional(), op }).strict();
export function parseRequest(value: unknown): z.infer<typeof requestSchema> {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success || Buffer.byteLength(JSON.stringify(value)) > 65536) return invalid();
  const r = parsed.data;
  if ((r.op.kind === 'hello') !== (r.connectionId === undefined)) return invalid();
  const deadline = ['watch.renew', 'watch.detach', 'request.cancel'].includes(r.op.kind) ? 5000 : ['command', 'session.create'].includes(r.op.kind) ? 10000 : 15000;
  const remaining = Date.parse(r.expiresAt) - Date.now();
  if (remaining <= 0 || remaining > deadline) return invalid();
  return r;
}

const partSchema = z.object({ frameId: uuid, requestId: uuid, index: z.number().int().min(0), count: z.number().int().min(1).max(128), sha256: z.string().regex(/^[0-9a-f]{64}$/), data: z.string().max(87384) }).strict();
export function parsePart(value: unknown): z.infer<typeof partSchema> {
  const parsed = partSchema.safeParse(value);
  if (!parsed.success) return invalid();
  const part = parsed.data;
  const bytes = Buffer.from(part.data, 'base64');
  if (part.index >= part.count || bytes.length > 65536 || !bytes.length || bytes.toString('base64') !== part.data) return invalid();
  return part;
}

export function bodyObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== keys.length || keys.some((key) => !(key in body))) return invalid();
  if (body.protocol !== 2) throw new RelayError(400, 'unsupported_protocol');
  return body;
}
