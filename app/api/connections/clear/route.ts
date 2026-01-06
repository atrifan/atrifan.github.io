import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

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

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Clear mcpConnections from unsafeMetadata
    const { mcpConnections, ...restMetadata } = (user.unsafeMetadata || {}) as Record<string, unknown>;

    await client.users.updateUser(userId, {
      unsafeMetadata: restMetadata,
    });

    return NextResponse.json({
      success: true,
      message: 'MCP connections cleared',
      cleared: mcpConnections ? (mcpConnections as unknown[]).length : 0,
    });
  } catch (error) {
    console.error('Error clearing connections:', error);
    return NextResponse.json(
      { error: 'Failed to clear connections' },
      { status: 500 }
    );
  }
}

