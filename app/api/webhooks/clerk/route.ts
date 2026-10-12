import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/nextjs/server';
import {
  getAllApiKeysByUser,
  getApiKeysByUser,
  deleteApiKey,
  updateApiKey,
} from '@/src/lib/supabase-services';
import { normalizePlan, planFromSubscription } from '@/src/lib/plans';
import { deleteContact, syncContactFromClerk } from '@/src/lib/notify/notify';
import { onSubscriptionEvent, recordSubscription } from '@/src/lib/credits/grant-service';
import { periodAnchorFromSubscription } from '@/src/lib/credits/grants';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;


/**
 * Subscription event data structure from Clerk Billing
 */
interface SubscriptionEventData {
  id: string;
  user_id: string;
  plan_id?: string;
  plan?: { slug?: string } | null;
  items?: Array<{ status?: string; plan?: { slug?: string } | null; period_start?: number }> | null;
  status?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  current_period_start?: number;
  current_period_end?: number;
  canceled_at?: number;
}

/**
 * Verify and parse Clerk webhook
 */
async function verifyWebhook(request: NextRequest): Promise<WebhookEventExtended | null> {
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return null;
  }

  const svix_id = request.headers.get('svix-id');
  const svix_timestamp = request.headers.get('svix-timestamp');
  const svix_signature = request.headers.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('Missing svix headers');
    return null;
  }

  const body = await request.text();

  try {
    const wh = new Webhook(webhookSecret);
    // Cast to unknown first to handle subscription events not in WebhookEvent type
    return wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as unknown as WebhookEventExtended;
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return null;
  }
}

// Extended webhook event type to include subscription events
type WebhookEventExtended = WebhookEvent | {
  type: 'subscription.created' | 'subscription.updated' | 'subscription.active' | 'subscription.deleted';
  data: SubscriptionEventData;
};

/**
 * Extract plan from user metadata or session claims
 * Clerk Billing stores plan in session claims as 'pla' with format 'u:pro'
 * This might also be in publicMetadata.plan if configured
 */
function extractPlan(userData: Record<string, unknown>): string {
  // Check publicMetadata.plan (if configured via Clerk dashboard)
  const publicMetadata = userData.public_metadata as Record<string, unknown> | undefined;
  if (publicMetadata?.plan) {
    return normalizePlan(publicMetadata.plan);
  }

  // Check privateMetadata.plan (alternative configuration)
  const privateMetadata = userData.private_metadata as Record<string, unknown> | undefined;
  if (privateMetadata?.plan) {
    return normalizePlan(privateMetadata.plan);
  }

  // Check for subscription status
  if (privateMetadata?.subscription === 'active' || publicMetadata?.subscription === 'active') {
    return 'pro';
  }

  return 'free';
}

/**
 * Handle plan changes for a user
 * - Downgrade to free: soft-disable keys (not delete) so they can be reactivated
 * - Upgrade from free: reactivate previously disabled keys
 * - Paid tier change: update plan field, keep keys active
 */
async function handlePlanChange(userId: string, newPlan: string): Promise<void> {
  console.log(`[webhook] Processing plan change for user ${userId}: new plan = ${newPlan}`);

  const apiKeys = await getAllApiKeysByUser(userId);

  if (apiKeys.length === 0) {
    console.log(`[webhook] No API keys found for user ${userId}`);
    return;
  }

  for (const apiKey of apiKeys) {
    const storedPlan = apiKey.plan || 'free';

    if (newPlan === 'free') {
      if (!apiKey.is_active) {
        continue;
      }
      console.log(`[webhook] Soft-disabling API key ${apiKey.id} (downgrade to free)`);
      await updateApiKey(apiKey.id, {
        is_active: false,
        plan: 'free',
        revoked_at: new Date().toISOString(),
      });
    } else if (storedPlan === 'free' || !apiKey.is_active) {
      console.log(`[webhook] Reactivating API key ${apiKey.id} (upgrade to ${newPlan})`);
      await updateApiKey(apiKey.id, {
        is_active: true,
        plan: newPlan,
        revoked_at: null,
      });
    } else if (storedPlan !== newPlan) {
      console.log(`[webhook] Updating API key ${apiKey.id} plan: ${storedPlan} -> ${newPlan}`);
      await updateApiKey(apiKey.id, { plan: newPlan });
    }
  }
}

/**
 * POST /api/webhooks/clerk
 * Handles Clerk webhook events for user updates and subscription changes
 */
export async function POST(request: NextRequest) {
  const event = await verifyWebhook(request);

  if (!event) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }

  console.log(`[webhook] Received Clerk event: ${event.type}`);

  try {
    switch (event.type) {
      case 'user.created': {
        await syncContactFromClerk(event.data);
        break;
      }

      case 'user.updated': {
        const userId = event.data.id;
        const newPlan = extractPlan(event.data as unknown as Record<string, unknown>);
        await handlePlanChange(userId, newPlan);
        await syncContactFromClerk(event.data);
        break;
      }

      case 'user.deleted': {
        // User deleted - clean up all their data
        const userId = event.data.id;
        if (userId) {
          console.log(`[webhook] User deleted: ${userId}`);
          const apiKeys = await getApiKeysByUser(userId);
          for (const apiKey of apiKeys) {
            await deleteApiKey(apiKey.id);
          }
          await deleteContact(userId);
        }
        break;
      }

      // Clerk Billing subscription events
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.active': {
        const subData = event.data as unknown as SubscriptionEventData;
        const userId = subData.user_id;
        const status = subData.status;
        const newPlan = planFromSubscription(subData);

        console.log(`[webhook] Subscription ${event.type}: user=${userId}, plan=${newPlan}, status=${status}`);

        if (status === 'active' || status === 'trialing' || status === undefined) {
          if (newPlan === 'free') {
            console.warn(`[webhook] No known paid plan in subscription for user ${userId}; treating as free`);
          }
          await handlePlanChange(userId, newPlan);
        } else if (status === 'canceled' || status === 'incomplete') {
          // Subscription canceled or failed - downgrade to free
          await handlePlanChange(userId, 'free');
        }
        // Monthly plan credits: granted once per user per period (credit_grants is unique);
        // the cron app/api/cron/credit-grants catches missed renewals.
        const grant = await onSubscriptionEvent({
          userId,
          plan: newPlan,
          status,
          anchor: periodAnchorFromSubscription(subData),
          subscriptionId: subData.id ?? null,
        });
        if (grant) console.log(`[webhook] Plan credits for ${userId}: ${grant.status}`);
        break;
      }

      case 'subscription.deleted': {
        // Subscription fully deleted - downgrade to free
        const subData = event.data as unknown as SubscriptionEventData;
        const userId = subData.user_id;
        console.log(`[webhook] Subscription deleted for user ${userId}`);
        await handlePlanChange(userId, 'free');
        // No more grants; the current one expires when its period ends (credit-grants cron).
        await recordSubscription({ userId, plan: 'free', status: 'canceled', anchor: null, subscriptionId: subData.id ?? null });
        break;
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[webhook] Error processing event:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

