import { NextRequest, NextResponse } from 'next/server';
import { getNotifyStore, getUnsubscribeSecret } from '@/src/lib/notify/notify';
import { verifyUnsubscribeToken, type UnsubscribeClaims } from '@/src/lib/notify/token';
import { NOTIFICATION_LABELS } from '@/src/lib/notify/types';
import { appUrl } from '@/src/lib/notify/urls';
import { escapeHtml } from '@/src/lib/notify/templates/layout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/notifications/unsubscribe?token=…  → unsubscribes, returns an HTML confirmation.
 * POST /api/notifications/unsubscribe?token=…  → RFC 8058 one-click (body `List-Unsubscribe=One-Click`).
 * The token is signed (HMAC) and names one user and one notification type.
 */

function claimsFrom(token: string | null): UnsubscribeClaims | null {
  if (!token) return null;
  try {
    return verifyUnsubscribeToken(token, getUnsubscribeSecret());
  } catch {
    return null;
  }
}

async function tokenFromPost(request: NextRequest): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const value = form?.get('token');
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function page(status: number, title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Tulzo</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;color:#1f2328}main{max-width:480px;margin:15vh auto;padding:32px 24px;background:#fff;border:1px solid #e3e6ea;border-radius:12px}h1{font-size:22px;margin:0 0 12px}p{line-height:1.5;margin:0 0 12px}a{color:#3b5bdb}@media (prefers-color-scheme:dark){body{background:#15171a;color:#e8eaed}main{background:#1f2227;border-color:#30353c}a{color:#91a7ff}}</style></head>
<body><main><p style="font-weight:700">Tulzo</p><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const claims = claimsFrom(request.nextUrl.searchParams.get('token'));
  if (!claims) {
    return page(400, 'This link is not valid', '<p>The unsubscribe link is broken or incomplete. You can change your email settings from your profile.</p>');
  }
  try {
    await getNotifyStore().setPreferences(claims.userId, { [claims.type]: false });
  } catch (err) {
    console.error('[notify] unsubscribe failed', err instanceof Error ? err.message : String(err));
    return page(500, 'Something went wrong', '<p>We could not update your settings. Please try the link again in a minute.</p>');
  }
  const label = NOTIFICATION_LABELS[claims.type];
  return page(
    200,
    "You're unsubscribed",
    `<p>You won't get "${escapeHtml(label)}" emails any more.</p><p><a href="${escapeHtml(appUrl('hub', '/profile'))}">Manage all email preferences</a></p>`,
  );
}

export async function POST(request: NextRequest) {
  const claims = claimsFrom(await tokenFromPost(request));
  if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  try {
    await getNotifyStore().setPreferences(claims.userId, { [claims.type]: false });
  } catch (err) {
    console.error('[notify] one-click unsubscribe failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 });
  }
  return NextResponse.json({ unsubscribed: true, type: claims.type });
}
