import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getUserPreferences,
  upsertUserPreferences,
} from '@/src/lib/supabase-services';

/**
 * Get user preferences
 * GET /api/preferences
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const prefs = await getUserPreferences(userId);

    if (!prefs) {
      return NextResponse.json({
        preferences: null,
      });
    }

    return NextResponse.json({
      preferences: {
        timeFormat: prefs.time_format,
        measurementSystem: prefs.measurement_system,
        currency: prefs.currency,
      },
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
    const { preferences } = body;

    if (!preferences) {
      return NextResponse.json(
        { error: 'Preferences required' },
        { status: 400 }
      );
    }

    await upsertUserPreferences({
      user_id: userId,
      time_format: preferences.timeFormat,
      measurement_system: preferences.measurementSystem,
      currency: preferences.currency,
    });

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

