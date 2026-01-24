import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL!;
const supabaseKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/push/subscribe
 * 
 * Register a push subscription for the current user.
 * 
 * Body:
 * - subscription: PushSubscription object from browser
 *   - endpoint: string
 *   - keys: { p256dh: string, auth: string }
 * - deviceName?: string (e.g., "Chrome on MacBook")
 * - deviceType?: 'desktop' | 'mobile' | 'tablet'
 * - browser?: string
 * - os?: string
 * - channels?: string[] (notification types to receive)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subscription, deviceName, deviceType, browser, os, channels } = body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription: endpoint and keys (p256dh, auth) are required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert subscription (update if endpoint already exists for user)
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh_key: subscription.keys.p256dh,
          auth_key: subscription.keys.auth,
          device_name: deviceName || 'Unknown Device',
          device_type: deviceType || 'desktop',
          browser: browser || 'unknown',
          os: os || 'unknown',
          channels: channels || ['automation', 'input_required', 'error'],
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,endpoint',
        }
      )
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save push subscription:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      subscriptionId: data.id,
      message: 'Push notifications enabled',
    });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/push/subscribe
 * 
 * Get all push subscriptions for the current user.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, device_name, device_type, browser, os, channels, enabled, created_at, last_used_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch push subscriptions:', error);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    return NextResponse.json({
      subscriptions: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('Push subscribe GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/push/subscribe
 * 
 * Unsubscribe from push notifications.
 * 
 * Body:
 * - endpoint: string (the push endpoint to remove)
 * - subscriptionId?: string (alternative: remove by ID)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, subscriptionId } = body;

    if (!endpoint && !subscriptionId) {
      return NextResponse.json(
        { error: 'Either endpoint or subscriptionId is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase.from('push_subscriptions').delete().eq('user_id', userId);

    if (subscriptionId) {
      query = query.eq('id', subscriptionId);
    } else if (endpoint) {
      query = query.eq('endpoint', endpoint);
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to delete push subscription:', error);
      return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Push notifications disabled',
    });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

