/**
 * Chat History Embeddings Service
 * 
 * Embeds chat messages to Upstash Vector for semantic search and context retrieval.
 * 
 * Naming conventions:
 * - Chat history: rag_name = "chat_history-{chat_id}"
 * - RAG history: rag_name = "rag_history-{session_id}"
 * 
 * Metadata includes:
 * - user_id: Clerk user ID
 * - chat_id: Conversation/session ID
 * - message_type: "user" | "assistant"
 * - raw_response: For assistant messages, includes tool calls/results
 * - timestamp: ISO timestamp
 */

import { Index } from '@upstash/vector';

// History types
export type HistoryType = 'chat_history' | 'rag_history';

// Metadata for history embeddings
export interface HistoryEmbeddingMetadata {
  user_id: string;
  rag_name: string;  // Format: "{type}-{id}" e.g., "chat_history-abc123"
  chat_id: string;   // The conversation/session ID
  message_type: 'user' | 'assistant';
  content: string;   // The message content
  raw_response?: string;  // For assistant: tool calls, reasoning, etc.
  model_id?: string;  // Model used for this message
  timestamp: string;  // ISO timestamp
  [key: string]: unknown;  // Index signature for Upstash
}

// Get Upstash Vector index
function getIndex(): Index {
  const url = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL;
  const token = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Upstash Vector not configured');
  }

  return new Index({ url, token });
}

/**
 * Generate a unique vector ID for a history message
 */
export function generateHistoryVectorId(
  historyType: HistoryType,
  chatId: string,
  userId: string,
  messageId: string
): string {
  return `${historyType}-${chatId}_${userId}_${messageId}`;
}

/**
 * Get the rag_name for a history type
 */
export function getHistoryRagName(historyType: HistoryType, chatId: string): string {
  return `${historyType}-${chatId}`;
}

/**
 * Embed a chat message to Upstash Vector
 */
export async function embedChatMessage(params: {
  userId: string;
  chatId: string;
  messageId: string;
  messageType: 'user' | 'assistant';
  content: string;
  rawResponse?: string;
  modelId?: string;
  historyType?: HistoryType;
}): Promise<{ success: boolean; vectorId: string }> {
  const {
    userId,
    chatId,
    messageId,
    messageType,
    content,
    rawResponse,
    modelId,
    historyType = 'chat_history',
  } = params;

  const index = getIndex();
  const ragName = getHistoryRagName(historyType, chatId);
  const vectorId = generateHistoryVectorId(historyType, chatId, userId, messageId);

  // Build embedding text - include role prefix for better semantic search
  const embeddingText = `${messageType}: ${content}${rawResponse ? `\n\nTool Response: ${rawResponse}` : ''}`;

  const metadata: HistoryEmbeddingMetadata = {
    user_id: userId,
    rag_name: ragName,
    chat_id: chatId,
    message_type: messageType,
    content,
    raw_response: rawResponse,
    model_id: modelId,
    timestamp: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await index.upsert([{ id: vectorId, data: embeddingText, metadata }] as any);

  return { success: true, vectorId };
}

/**
 * Search chat history for similar messages
 */
export async function searchChatHistory(params: {
  userId: string;
  chatId: string;
  query: string;
  topK?: number;
  historyType?: HistoryType;
}): Promise<Array<{
  id: string;
  score: number;
  metadata: HistoryEmbeddingMetadata;
}>> {
  const { userId, chatId, query, topK = 3, historyType = 'chat_history' } = params;

  const index = getIndex();
  const ragName = getHistoryRagName(historyType, chatId);

  const results = await index.query({
    data: query,
    topK,
    includeMetadata: true,
    filter: `user_id = '${userId}' AND rag_name = '${ragName}'`,
  });

  return results.map(r => ({
    id: r.id as string,
    score: r.score,
    metadata: r.metadata as unknown as HistoryEmbeddingMetadata,
  }));
}

/**
 * Search across all user's chat histories
 */
export async function searchAllUserHistory(params: {
  userId: string;
  query: string;
  topK?: number;
  historyType?: HistoryType;
}): Promise<Array<{
  id: string;
  score: number;
  metadata: HistoryEmbeddingMetadata;
}>> {
  const { userId, query, topK = 5, historyType = 'chat_history' } = params;

  const index = getIndex();

  // Filter by user_id and rag_name prefix
  const results = await index.query({
    data: query,
    topK,
    includeMetadata: true,
    filter: `user_id = '${userId}' AND rag_name GLOB '${historyType}-*'`,
  });

  return results.map(r => ({
    id: r.id as string,
    score: r.score,
    metadata: r.metadata as unknown as HistoryEmbeddingMetadata,
  }));
}

/**
 * Delete all embeddings for a specific chat/session
 */
export async function deleteChatHistoryEmbeddings(params: {
  userId: string;
  chatId: string;
  historyType?: HistoryType;
}): Promise<{ success: boolean; deletedCount: number }> {
  const { userId, chatId, historyType = 'chat_history' } = params;

  const index = getIndex();
  const prefix = `${historyType}-${chatId}_${userId}_`;

  // Get all vector IDs with this prefix
  const allIds: string[] = [];
  let cursor: string | number = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const rangeResult: { vectors: Array<{ id: string | number }>; nextCursor?: string | number } = await index.range({
      cursor: cursor.toString(),
      limit,
      includeMetadata: false,
    });

    const matchingIds = rangeResult.vectors
      .filter(v => (v.id as string).startsWith(prefix))
      .map(v => v.id as string);

    allIds.push(...matchingIds);

    if (rangeResult.nextCursor) {
      cursor = rangeResult.nextCursor;
    } else {
      hasMore = false;
    }
  }

  // Delete in batches
  if (allIds.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < allIds.length; i += batchSize) {
      const batch = allIds.slice(i, i + batchSize);
      await index.delete(batch);
    }
  }

  return { success: true, deletedCount: allIds.length };
}

/**
 * Get top N parent messages for context injection
 * Used to prepend system prompt with relevant history
 */
export async function getParentMessagesForContext(params: {
  userId: string;
  chatId: string;
  currentMessage: string;
  topK?: number;
  historyType?: HistoryType;
}): Promise<string[]> {
  const { userId, chatId, currentMessage, topK = 3, historyType = 'chat_history' } = params;

  const results = await searchChatHistory({
    userId,
    chatId,
    query: currentMessage,
    topK,
    historyType,
  });

  // Format as context strings
  return results.map(r => {
    const meta = r.metadata;
    const prefix = meta.message_type === 'user' ? 'User asked' : 'Assistant replied';
    return `${prefix}: ${meta.content}`;
  });
}

/**
 * Check if Upstash Vector is configured
 */
export function isHistoryEmbeddingsConfigured(): boolean {
  return !!(
    process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL &&
    process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN
  );
}
