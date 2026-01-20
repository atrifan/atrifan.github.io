import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getUserPreferences,
  upsertUserPreferences,
} from '@/src/lib/supabase-services';

export const dynamic = 'force-dynamic';

/**
 * Get user preferences
 * GET /api/preferences
 * Query params:
 * - context: 'chat' | 'automation' (optional, returns context-specific settings)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const context = searchParams.get('context') as 'chat' | 'automation' | null;

    const prefs = await getUserPreferences(userId);

    if (!prefs) {
      return NextResponse.json({
        preferences: null,
        contextSettings: null,
      });
    }

    // Base preferences
    const basePrefs = {
      timeFormat: prefs.time_format,
      measurementSystem: prefs.measurement_system,
      currency: prefs.currency,
    };

    // Context-specific settings
    let contextSettings = null;
    if (context === 'chat') {
      contextSettings = prefs.chat_settings || {};
    } else if (context === 'automation') {
      contextSettings = prefs.automation_settings || {};
    }

    return NextResponse.json({
      preferences: basePrefs,
      contextSettings,
      // Also return both for convenience
      chatSettings: prefs.chat_settings || {},
      automationSettings: prefs.automation_settings || {},
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

/**
 * Update user preferences
 * PUT /api/preferences
 * Body:
 * - preferences: { timeFormat, measurementSystem, currency }
 * - chatSettings: { enableReasoning, sendHistory, historyMemoryEnabled, defaultModel }
 * - automationSettings: { enableReasoning, sendHistory, historyMemoryEnabled, defaultModel }
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { preferences, chatSettings, automationSettings } = body;

    // Build upsert data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upsertData: any = { user_id: userId };

    if (preferences) {
      if (preferences.timeFormat) upsertData.time_format = preferences.timeFormat;
      if (preferences.measurementSystem) upsertData.measurement_system = preferences.measurementSystem;
      if (preferences.currency) upsertData.currency = preferences.currency;
    }

    if (chatSettings !== undefined) {
      upsertData.chat_settings = chatSettings;
    }

    if (automationSettings !== undefined) {
      upsertData.automation_settings = automationSettings;
    }

    await upsertUserPreferences(upsertData);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

/**
 * Partial update for context-specific settings
 * PATCH /api/preferences
 * Body:
 * - context: 'chat' | 'automation'
 * - settings: { enableReasoning?, sendHistory?, historyMemoryEnabled?, defaultModel? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { context, settings } = body;

    if (!context || !['chat', 'automation'].includes(context)) {
      return NextResponse.json(
        { error: 'Valid context (chat or automation) required' },
        { status: 400 }
      );
    }

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Settings object required' },
        { status: 400 }
      );
    }

    // Get current preferences to merge settings
    const currentPrefs = await getUserPreferences(userId);
    const currentSettings = context === 'chat'
      ? (currentPrefs?.chat_settings || {})
      : (currentPrefs?.automation_settings || {});

    // Merge new settings with existing
    const mergedSettings = { ...currentSettings, ...settings };

    // Build upsert data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upsertData: any = { user_id: userId };
    if (context === 'chat') {
      upsertData.chat_settings = mergedSettings;
    } else {
      upsertData.automation_settings = mergedSettings;
    }

    await upsertUserPreferences(upsertData);

    return NextResponse.json({
      success: true,
      settings: mergedSettings,
    });
  } catch (error) {
    console.error('Error patching preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

