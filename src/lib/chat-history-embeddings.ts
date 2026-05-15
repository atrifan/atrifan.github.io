/**
 * Chat History Embeddings Service (DISABLED)
 *
 * Vector storage is not required for the current platform.
 * All functions are no-ops.
 */

export type HistoryType = 'chat_history' | 'rag_history';

export interface HistoryEmbeddingMetadata {
  user_id: string;
  rag_name: string;
  chat_id: string;
  message_type: 'user' | 'assistant';
  content: string;
  raw_response?: string;
  timestamp: string;
  [key: string]: unknown;
}

export function isChatHistoryEmbeddingsConfigured(): boolean {
  return false;
}

export async function embedChatMessage(
  _message: Record<string, unknown>,
  _userId: string,
  _chatId: string
): Promise<{ success: boolean }> {
  return { success: false };
}

export async function searchChatHistory(
  _userId: string,
  _chatId: string,
  _query: string,
  _topK?: number
): Promise<Array<{ id: string; score: number; metadata: HistoryEmbeddingMetadata }>> {
  return [];
}

export async function searchAllUserHistory(
  _userId: string,
  _query: string,
  _topK?: number
): Promise<Array<{ id: string; score: number; metadata: HistoryEmbeddingMetadata }>> {
  return [];
}

export async function deleteChatHistoryEmbeddings(
  _userId: string,
  _chatId: string
): Promise<{ success: boolean }> {
  return { success: true };
}
