/**
 * Automation Embeddings Service
 *
 * Embeds automation YAML definitions to Upstash Vector for semantic search.
 *
 * Naming conventions:
 * - Automation: rag_name = "automation-{automation_id}"
 * - type = "automation" (to distinguish from chat_history, rag_history)
 *
 * Metadata includes:
 * - user_id: Clerk user ID
 * - type: "automation"
 * - automation_id: Database UUID
 * - name: snake_case identifier (from YAML id)
 * - display_name: Human-readable name
 * - category: Automation category
 * - description: Automation description
 * - edit_url: Link to edit the automation
 * - yaml_content: Full YAML for context
 * - timestamp: ISO timestamp
 */

import { Index } from '@upstash/vector';

// Metadata for automation embeddings
export interface AutomationEmbeddingMetadata {
  user_id: string;
  type: 'automation';
  rag_name: string;  // Format: "automation-{automation_id}"
  automation_id: string;
  name: string;      // snake_case id
  display_name: string;
  category: string;
  description?: string;
  edit_url: string;
  yaml_content: string;
  timestamp: string;
  [key: string]: unknown;
}

// Singleton index instance
let indexInstance: Index | null = null;

function getIndex(): Index {
  if (!indexInstance) {
    const url = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL;
    const token = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN;

    if (!url || !token) {
      throw new Error('Upstash Vector not configured for automation embeddings');
    }

    indexInstance = new Index({ url, token });
  }
  return indexInstance;
}

/**
 * Check if automation embeddings are configured
 */
export function isAutomationEmbeddingsConfigured(): boolean {
  return !!(
    process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL &&
    process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN
  );
}

/**
 * Generate vector ID for automation
 */
function generateAutomationVectorId(automationId: string, userId: string): string {
  return `automation-${userId}-${automationId}`;
}

/**
 * Get rag_name for automation
 */
function getAutomationRagName(automationId: string): string {
  return `automation-${automationId}`;
}

/**
 * Build embedding text from automation data
 * Combines name, description, category, and YAML for rich semantic search
 */
function buildEmbeddingText(params: {
  name: string;
  displayName: string;
  description?: string;
  category: string;
  yamlContent: string;
}): string {
  const parts = [
    `Automation: ${params.displayName}`,
    `ID: ${params.name}`,
    `Category: ${params.category}`,
  ];

  if (params.description) {
    parts.push(`Description: ${params.description}`);
  }

  // Add YAML content (truncated if too long)
  const maxYamlLength = 2000;
  const yamlPreview = params.yamlContent.length > maxYamlLength
    ? params.yamlContent.slice(0, maxYamlLength) + '...'
    : params.yamlContent;

  parts.push(`\nWorkflow Definition:\n${yamlPreview}`);

  return parts.join('\n');
}

/**
 * Embed an automation to Upstash Vector
 */
export async function embedAutomation(params: {
  userId: string;
  automationId: string;
  name: string;
  displayName: string;
  category: string;
  description?: string;
  yamlContent: string;
  baseUrl?: string;
}): Promise<{ success: boolean; vectorId: string }> {
  const {
    userId,
    automationId,
    name,
    displayName,
    category,
    description,
    yamlContent,
    baseUrl = '',
  } = params;

  const index = getIndex();
  const ragName = getAutomationRagName(automationId);
  const vectorId = generateAutomationVectorId(automationId, userId);
  const editUrl = `${baseUrl}/automation?id=${automationId}`;

  const embeddingText = buildEmbeddingText({
    name,
    displayName,
    description,
    category,
    yamlContent,
  });

  const metadata: AutomationEmbeddingMetadata = {
    user_id: userId,
    type: 'automation',
    rag_name: ragName,
    automation_id: automationId,
    name,
    display_name: displayName,
    category,
    description,
    edit_url: editUrl,
    yaml_content: yamlContent,
    timestamp: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await index.upsert([{ id: vectorId, data: embeddingText, metadata }] as any);

  return { success: true, vectorId };
}

/**
 * Delete automation embedding from Upstash Vector
 */
export async function deleteAutomationEmbedding(params: {
  userId: string;
  automationId: string;
}): Promise<{ success: boolean }> {
  const { userId, automationId } = params;
  const index = getIndex();
  const vectorId = generateAutomationVectorId(automationId, userId);

  try {
    await index.delete(vectorId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete automation embedding:', error);
    return { success: false };
  }
}

// Metadata for automation execution history embeddings
export interface AutomationHistoryEmbeddingMetadata {
  user_id: string;
  type: 'automation_history';
  rag_name: string;  // Format: "automation-history-{automation_id}"
  automation_id: string;
  execution_id: string;
  automation_name: string;
  status: string;
  trigger_type: string;
  summary: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  steps_completed: number;
  error?: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Generate vector ID for automation execution history
 */
function generateHistoryVectorId(executionId: string, userId: string): string {
  return `automation-history-${userId}-${executionId}`;
}

/**
 * Get rag_name for automation history
 */
function getAutomationHistoryRagName(automationId: string): string {
  return `automation-history-${automationId}`;
}

/**
 * Build embedding text from execution data
 */
function buildHistoryEmbeddingText(params: {
  automationName: string;
  status: string;
  triggerType: string;
  summary: string;
  stepsCompleted: number;
  error?: string;
}): string {
  const parts = [
    `Automation Execution: ${params.automationName}`,
    `Status: ${params.status}`,
    `Trigger: ${params.triggerType}`,
    `Steps Completed: ${params.stepsCompleted}`,
  ];

  if (params.summary) {
    parts.push(`Summary: ${params.summary}`);
  }

  if (params.error) {
    parts.push(`Error: ${params.error}`);
  }

  return parts.join('\n');
}

/**
 * Embed an automation execution to Upstash Vector
 */
export async function embedAutomationExecution(params: {
  userId: string;
  automationId: string;
  executionId: string;
  automationName: string;
  status: string;
  triggerType: string;
  summary: string;
  stepsCompleted: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}): Promise<{ success: boolean; vectorId: string }> {
  const {
    userId,
    automationId,
    executionId,
    automationName,
    status,
    triggerType,
    summary,
    stepsCompleted,
    startedAt,
    completedAt,
    durationMs,
    error,
  } = params;

  const index = getIndex();
  const ragName = getAutomationHistoryRagName(automationId);
  const vectorId = generateHistoryVectorId(executionId, userId);

  const embeddingText = buildHistoryEmbeddingText({
    automationName,
    status,
    triggerType,
    summary,
    stepsCompleted,
    error,
  });

  const metadata: AutomationHistoryEmbeddingMetadata = {
    user_id: userId,
    type: 'automation_history',
    rag_name: ragName,
    automation_id: automationId,
    execution_id: executionId,
    automation_name: automationName,
    status,
    trigger_type: triggerType,
    summary,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    steps_completed: stepsCompleted,
    error,
    timestamp: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await index.upsert([{ id: vectorId, data: embeddingText, metadata }] as any);

  return { success: true, vectorId };
}

/**
 * Delete automation execution history embedding
 */
export async function deleteAutomationHistoryEmbedding(params: {
  userId: string;
  executionId: string;
}): Promise<{ success: boolean }> {
  const { userId, executionId } = params;
  const index = getIndex();
  const vectorId = generateHistoryVectorId(executionId, userId);

  try {
    await index.delete(vectorId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete automation history embedding:', error);
    return { success: false };
  }
}

/**
 * Search user's automations by semantic query
 */
export async function searchUserAutomations(params: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<Array<{
  automationId: string;
  name: string;
  displayName: string;
  category: string;
  description?: string;
  editUrl: string;
  score: number;
}>> {
  const { userId, query, topK = 5 } = params;
  const index = getIndex();

  const results = await index.query({
    data: query,
    topK,
    includeMetadata: true,
    filter: `user_id = '${userId}' AND type = 'automation'`,
  });

  return results
    .filter(r => r.metadata)
    .map(r => {
      const meta = r.metadata as AutomationEmbeddingMetadata;
      return {
        automationId: meta.automation_id,
        name: meta.name,
        displayName: meta.display_name,
        category: meta.category,
        description: meta.description,
        editUrl: meta.edit_url,
        score: r.score,
      };
    });
}

/**
 * Unified search across all user content (automations, automation history, chat history, RAGs)
 * Plus Tulzo website content
 */
export async function unifiedSearch(params: {
  userId: string;
  query: string;
  topK?: number;
  includeTypes?: Array<'automation' | 'automation_history' | 'chat_history' | 'rag_history' | 'website' | 'rag'>;
}): Promise<Array<{
  type: string;
  title: string;
  description?: string;
  url: string;
  score: number;
  metadata: Record<string, unknown>;
}>> {
  const { userId, query, topK = 10, includeTypes } = params;
  const index = getIndex();

  // Build filter for user content + tulzo website
  // Search user's content and tulzo's website content
  const userFilter = `user_id = '${userId}'`;
  const tulzoFilter = `user_id = 'tulzo'`;

  // Query both in parallel
  const [userResults, tulzoResults] = await Promise.all([
    index.query({
      data: query,
      topK,
      includeMetadata: true,
      filter: userFilter,
    }),
    index.query({
      data: query,
      topK: 5, // Limit tulzo results
      includeMetadata: true,
      filter: tulzoFilter,
    }),
  ]);

  // Combine and normalize results
  const allResults = [...userResults, ...tulzoResults];

  // Filter by type if specified
  // Helper to determine type from metadata
  const getTypeFromMeta = (meta: Record<string, unknown>): string => {
    if (meta.type) return meta.type as string;
    const ragName = meta.rag_name?.toString() || '';
    if (ragName.startsWith('automation-history')) return 'automation_history';
    if (ragName.startsWith('chat_history')) return 'chat_history';
    if (ragName.startsWith('rag_history')) return 'rag_history';
    if (ragName.startsWith('automation')) return 'automation';
    if (meta.user_id === 'tulzo') return 'website';
    return 'rag';
  };

  const filteredResults = includeTypes
    ? allResults.filter(r => {
        const meta = r.metadata as Record<string, unknown>;
        const type = getTypeFromMeta(meta);
        return includeTypes.includes(type as typeof includeTypes[number]);
      })
    : allResults;

  // Sort by score and dedupe
  const seen = new Set<string>();
  const normalized = filteredResults
    .sort((a, b) => b.score - a.score)
    .filter(r => {
      const id = String(r.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, topK)
    .map(r => {
      const meta = r.metadata as Record<string, unknown>;
      const type = getTypeFromMeta(meta);

      // Build title and URL based on type
      let title = '';
      let url = '';
      let description = '';

      switch (type) {
        case 'automation':
          title = `🤖 ${meta.display_name || meta.name}`;
          url = meta.edit_url as string || `/automation?id=${meta.automation_id}`;
          description = meta.description as string;
          break;
        case 'automation_history':
          title = `📜 Run: ${meta.automation_name} (${meta.status})`;
          url = `/automation?id=${meta.automation_id}&execution=${meta.execution_id}`;
          description = meta.summary as string || `${meta.status} - ${meta.steps_completed} steps`;
          break;
        case 'chat_history':
          title = `💬 Chat: ${(meta.content as string)?.slice(0, 50)}...`;
          url = `/chat?id=${meta.chat_id}`;
          description = meta.content as string;
          break;
        case 'rag_history':
          title = `📚 RAG Session: ${meta.chat_id}`;
          url = `/rag?session=${meta.chat_id}`;
          description = meta.content as string;
          break;
        case 'website':
          title = `🌐 ${meta.title}`;
          url = meta.source as string || '/';
          description = meta.content as string;
          break;
        default:
          title = `📄 ${meta.title || 'Document'}`;
          url = meta.source as string || '#';
          description = meta.content as string;
      }

      return {
        type,
        title,
        description: description?.slice(0, 200),
        url,
        score: r.score,
        metadata: meta,
      };
    });

  return normalized;
}
