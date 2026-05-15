/**
 * Automation Embeddings Service (DISABLED)
 *
 * Vector storage is not required for the current platform.
 * All functions are no-ops.
 */

export interface AutomationEmbeddingMetadata {
  user_id: string;
  type: 'automation';
  rag_name: string;
  automation_id: string;
  name: string;
  display_name: string;
  category: string;
  description?: string;
  edit_url: string;
  yaml_content: string;
  timestamp: string;
  [key: string]: unknown;
}

export function isAutomationEmbeddingsConfigured(): boolean {
  return false;
}

export async function embedAutomation(
  _automation: Record<string, unknown>,
  _userId: string
): Promise<{ success: boolean }> {
  return { success: false };
}

export async function deleteAutomationEmbedding(
  _automationId: string,
  _userId: string
): Promise<{ success: boolean }> {
  return { success: true };
}

export async function embedAutomationExecution(
  _execution: Record<string, unknown>,
  _userId: string
): Promise<{ success: boolean }> {
  return { success: false };
}

export async function searchUserAutomations(
  _userId: string,
  _query: string,
  _topK?: number
): Promise<Array<{ id: string; score: number; metadata: AutomationEmbeddingMetadata }>> {
  return [];
}

export async function unifiedSearch(
  _userId: string,
  _query: string,
  _topK?: number
): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
  return [];
}
