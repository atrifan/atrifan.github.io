import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  searchAllUserHistory,
  isHistoryEmbeddingsConfigured,
  HistoryType,
} from '@/src/lib/chat-history-embeddings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/history-search
 * 
 * Search across user's chat/rag history using semantic search.
 * Returns top 5 similar sessions/conversations.
 * 
 * Body:
 * - query: string - The search query
 * - historyType: 'chat_history' | 'rag_history' - Type of history to search
 * - topK?: number - Number of results (default 5)
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
    const { query, historyType = 'chat_history', topK = 5 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Validate historyType
    if (!['chat_history', 'rag_history'].includes(historyType)) {
      return NextResponse.json(
        { error: 'Invalid historyType. Must be chat_history or rag_history' },
        { status: 400 }
      );
    }

    const results = await searchAllUserHistory({
      userId,
      query,
      topK: Math.min(topK, 10), // Cap at 10
      historyType: historyType as HistoryType,
    });

    // Group results by chat_id to get unique sessions
    const sessionMap = new Map<string, {
      chatId: string;
      topScore: number;
      messages: Array<{
        id: string;
        score: number;
        messageType: string;
        content: string;
        timestamp: string;
      }>;
    }>();

    for (const result of results) {
      const chatId = result.metadata.chat_id;
      
      if (!sessionMap.has(chatId)) {
        sessionMap.set(chatId, {
          chatId,
          topScore: result.score,
          messages: [],
        });
      }

      const session = sessionMap.get(chatId)!;
      session.messages.push({
        id: result.id,
        score: result.score,
        messageType: result.metadata.message_type,
        content: result.metadata.content,
        timestamp: result.metadata.timestamp,
      });

      // Update top score if higher
      if (result.score > session.topScore) {
        session.topScore = result.score;
      }
    }

    // Convert to array and sort by top score
    const sessions = Array.from(sessionMap.values())
      .sort((a, b) => b.topScore - a.topScore)
      .slice(0, 5); // Return top 5 unique sessions

    return NextResponse.json({
      success: true,
      query,
      historyType,
      sessions,
      totalResults: results.length,
    });
  } catch (error) {
    console.error('History search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

