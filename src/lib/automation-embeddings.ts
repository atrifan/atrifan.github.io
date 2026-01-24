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

