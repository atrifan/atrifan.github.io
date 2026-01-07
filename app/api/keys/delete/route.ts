import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getApiKeyByUserAndServer, deleteApiKey } from '@/src/lib/supabase-services';

/**
 * Delete an API key for the authenticated user
 * DELETE /api/keys/delete
 *
 * - Deletes from Supabase (cascades to server_tools)
 * - If Clerk provider, also revokes in Clerk
 */
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get server_name from query params (default to 'default')
    const { searchParams } = new URL(request.url);
    const serverName = searchParams.get('server_name') || 'default';

    // Get the API key from Supabase
    const apiKey = await getApiKeyByUserAndServer(userId, serverName);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // If Clerk provider, revoke in Clerk first
    if (apiKey.provider === 'clerk') {
      try {
        const client = await clerkClient();
        const existingKeys = await client.apiKeys.list({ subject: userId });
        
        for (const key of existingKeys.data) {
          if (!key.revoked) {
            await client.apiKeys.revoke({
              apiKeyId: key.id,
              revocationReason: 'User deleted key'
            });
          }
        }
      } catch (e) {
        console.error('Error revoking Clerk API key:', e);
        // Continue with Supabase deletion even if Clerk fails
      }
    }

    // Delete from Supabase (cascades to server_tools)
    await deleteApiKey(apiKey.id);

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}

