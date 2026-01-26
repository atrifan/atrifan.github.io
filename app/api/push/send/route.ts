import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL!;
const supabaseKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

// VAPID keys for Web Push - generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notifications@tulzo.com';

// Configure web-push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * POST /api/push/send
 * 
 * Send a push notification to a user's registered devices.
 * Can be called by automations or internal services.
 * 
 * Body:
 * - userId: string (target user, defaults to current user)
 * - title: string
 * - body: string
 * - icon?: string
 * - tag?: string (for grouping notifications)
 * - data?: object (custom data, e.g., { url, type, automationId, executionId })
 * - actions?: array of { action, title, icon }
 * - channels?: string[] (filter by notification channel)
 * - requireInteraction?: boolean
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: authUserId } = await auth();
    
    // Allow internal calls without auth (for automation executor)
    const isInternalCall = request.headers.get('X-Internal-Call') === process.env.INTERNAL_API_SECRET;
    
    if (!authUserId && !isInternalCall) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Push notifications not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { 
      userId = authUserId, 
      title, 
      body: messageBody, 
      icon, 
      tag, 
      data, 
      actions, 
      channels,
      requireInteraction 
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!title || !messageBody) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's active push subscriptions
    let query = supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key, channels')
      .eq('user_id', userId)
      .eq('enabled', true);

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error('Failed to fetch push subscriptions:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No active push subscriptions found',
        sent: 0 
      });
    }

    // Filter by channel if specified
    // If channels includes 'all', send to all subscriptions without filtering
    const sendToAll = channels?.includes('all');
    const notificationType = data?.type || 'general';

    let filteredSubscriptions;
    if (sendToAll) {
      // 'all' means send to all active subscriptions
      filteredSubscriptions = subscriptions;
    } else if (channels) {
      // Filter to subscriptions that have any of the requested channels
      filteredSubscriptions = subscriptions.filter(sub => {
        const subChannels = sub.channels as string[] || [];
        return channels.some((c: string) => subChannels.includes(c));
      });
    } else {
      // No channels specified - filter by notification type
      filteredSubscriptions = subscriptions.filter(sub => {
        const subChannels = sub.channels as string[] || [];
        return subChannels.includes(notificationType) || subChannels.includes('all');
      });
    }

    if (filteredSubscriptions.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No subscriptions for channel: ${channels?.join(', ') || notificationType}`,
        sent: 0
      });
    }

    // Build notification payload
    const payload = JSON.stringify({
      title,
      body: messageBody,
      icon: icon || '/tulzo-logo.png',
      badge: '/tulzo-logo.png',
      tag: tag || `tulzo-${Date.now()}`,
      data: data || {},
      actions: actions || [],
      requireInteraction: requireInteraction || false,
    });

    // Send to all matching subscriptions
    const results = await Promise.allSettled(
      filteredSubscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          
          // Update last_used_at
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
            
          return { id: sub.id, success: true };
        } catch (error: unknown) {
          const pushError = error as { statusCode?: number };
          // If subscription is invalid (410 Gone), remove it
          if (pushError.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            return { id: sub.id, success: false, error: 'Subscription expired', removed: true };
          }
          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
      success: successful > 0,
      sent: successful,
      failed,
      total: filteredSubscriptions.length,
    });
  } catch (error) {
    console.error('Push send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

