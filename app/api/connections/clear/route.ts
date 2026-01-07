import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getApiKeysByUser } from '@/src/lib/supabase-services';
import { supabase } from '@/src/lib/supabase';

/**
 * Clear MCP connections for the authenticated user
 * DELETE /api/connections/clear
 */
export async function DELETE() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all API keys for this user
    const apiKeys = await getApiKeysByUser(userId);

    if (apiKeys.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No connections to clear',
        cleared: 0,
      });
    }

    // Delete connections for all user's API keys
    const apiKeyIds = apiKeys.map(k => k.id);

    const { data, error } = await supabase
      .from('mcp_connections')
      .delete()
      .in('api_key_id', apiKeyIds)
      .select('id');

    if (error) {
      console.error('Error clearing connections:', error);
      return NextResponse.json(
        { error: 'Failed to clear connections' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'MCP connections cleared',
      cleared: data?.length || 0,
    });
  } catch (error) {
    console.error('Error clearing connections:', error);
    return NextResponse.json(
      { error: 'Failed to clear connections' },
      { status: 500 }
    );
  }
}

