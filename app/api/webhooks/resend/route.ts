import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { MISCONFIGURED } from '@/src/lib/misconfigured';
import { JobsError } from '@/src/lib/jobs/errors';
import { receiveInboundEmail, SupportMisconfiguredError, type ReceivedEmailEvent } from '@/src/lib/support/support-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/resend: Resend's `email.received` event for mail to the support address
 * (register this URL in Resend with that event). Signed with Svix (`svix-id`, `svix-timestamp`,
 * `svix-signature`) using RESEND_WEBHOOK_SECRET; a missing or bad signature → 400.
 * → 200 `{ ok, thread_id, reference }`, `{ ok, duplicate: true }` for a redelivery, or
 * `{ ok, ignored: true }` for other events. A failure to fetch the message from Resend → 502,
 * so Resend retries.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json(MISCONFIGURED, { status: 500 });

  const payload = await request.text();
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  let event: ReceivedEmailEvent;
  try {
    event = new Webhook(secret).verify(payload, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature }) as ReceivedEmailEvent;
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    return NextResponse.json(await receiveInboundEmail(event));
  } catch (err) {
    if (err instanceof SupportMisconfiguredError) {
      console.error('[webhooks/resend]', err.message);
      return NextResponse.json(MISCONFIGURED, { status: 500 });
    }
    if (err instanceof JobsError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    console.error('[webhooks/resend] failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
