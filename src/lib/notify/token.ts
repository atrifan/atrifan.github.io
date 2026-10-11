import { createHmac, timingSafeEqual } from 'node:crypto';
import { isNotificationType, type NotificationType } from './types.ts';

/**
 * One-click unsubscribe tokens: `base64url(json).base64url(hmac-sha256(json-segment))`.
 * They don't expire, because unsubscribe links in old mail must keep working.
 */

export interface UnsubscribeClaims {
  userId: string;
  type: NotificationType;
}

const VERSION = 1;
const MIN_SECRET_LENGTH = 16;

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function signUnsubscribeToken(claims: UnsubscribeClaims, secret: string): string {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`NOTIFY_UNSUBSCRIBE_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const body = Buffer.from(JSON.stringify({ u: claims.userId, t: claims.type, v: VERSION })).toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): UnsubscribeClaims | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = mac(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object') return null;
  const { u, t, v } = decoded as { u?: unknown; t?: unknown; v?: unknown };
  if (v !== VERSION || typeof u !== 'string' || u.length === 0 || !isNotificationType(t)) return null;
  return { userId: u, type: t };
}
