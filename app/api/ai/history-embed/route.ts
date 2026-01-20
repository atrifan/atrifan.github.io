import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  embedChatMessage,
  deleteChatHistoryEmbeddings,
  isHistoryEmbeddingsConfigured,
  HistoryType,
} from '@/src/lib/chat-history-embeddings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/history-embed
 * 
 * Embed a chat message to Upstash Vector for semantic search.
 * 
 * Body:
 * - chatId: string - The conversation/session ID
 * - messageId: string - Unique message ID
 * - messageType: 'user' | 'assistant'
 * - content: string - The message content
 * - rawResponse?: string - For assistant: tool calls, reasoning, etc.
 * - modelId?: string - Model used
 * - historyType?: 'chat_history' | 'rag_history'
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isHistoryEmbeddingsConfigured()) {
      return NextResponse.json(
        { error: 'History embeddings not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const {
      chatId,
      messageId,
      messageType,
      content,
      rawResponse,
      modelId,
      historyType = 'chat_history',
    } = body;

    if (!chatId || !messageId || !messageType || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: chatId, messageId, messageType, content' },
        { status: 400 }
      );
    }

    if (!['user', 'assistant'].includes(messageType)) {
      return NextResponse.json(
        { error: 'messageType must be user or assistant' },
        { status: 400 }
      );
    }

    const result = await embedChatMessage({
      userId,
      chatId,
      messageId,
      messageType,
      content,
      rawResponse,
      modelId,
      historyType: historyType as HistoryType,
    });

    return NextResponse.json({
      success: true,
      vectorId: result.vectorId,
    });
  } catch (error) {
    console.error('History embed error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai/history-embed
 * 
 * Delete all embeddings for a specific chat/session.
 * 
 * Query params:
 * - chatId: string - The conversation/session ID to delete
 * - historyType?: 'chat_history' | 'rag_history'
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isHistoryEmbeddingsConfigured()) {
      return NextResponse.json(
        { error: 'History embeddings not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');
    const historyType = (searchParams.get('historyType') || 'chat_history') as HistoryType;

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
        { status: 400 }
      );
    }

    const result = await deleteChatHistoryEmbeddings({
      userId,
      chatId,
      historyType,
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('History delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

