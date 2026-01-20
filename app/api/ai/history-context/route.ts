import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getParentMessagesForContext,
  isHistoryEmbeddingsConfigured,
  HistoryType,
} from '@/src/lib/chat-history-embeddings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/history-context
 * 
 * Get top N parent messages for context injection into system prompt.
 * Returns formatted context strings that can be prepended to system prompt.
 * 
 * Body:
 * - chatId: string - The conversation/session ID
 * - currentMessage: string - The current user message to find related context for
 * - topK?: number - Number of parent messages to retrieve (default 3)
 * - historyType?: 'chat_history' | 'rag_history'
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isHistoryEmbeddingsConfigured()) {
      return NextResponse.json({
        success: true,
        context: [],
        contextString: '',
      });
    }

    const body = await request.json();
    const {
      chatId,
      currentMessage,
      topK = 3,
      historyType = 'chat_history',
    } = body;

    if (!chatId || !currentMessage) {
      return NextResponse.json(
        { error: 'Missing required fields: chatId, currentMessage' },
        { status: 400 }
      );
    }

    const parentMessages = await getParentMessagesForContext({
      userId,
      chatId,
      currentMessage,
      topK: Math.min(topK, 5), // Cap at 5
      historyType: historyType as HistoryType,
    });

    // Format as a context string for system prompt
    const contextString = parentMessages.length > 0
      ? `Relevant context from previous conversation:\n${parentMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n`
      : '';

    return NextResponse.json({
      success: true,
      context: parentMessages,
      contextString,
    });
  } catch (error) {
    console.error('History context error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

