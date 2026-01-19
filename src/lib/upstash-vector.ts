/**
 * Upstash Vector Integration
 * 
 * Stores embeddings with api_key and rag_name metadata for isolated collection search.
 * - User RAGs: api_key={user_api_key}, rag_name={normalized_rag_name}
 * - Website search: api_key="tulzo" (reserved for site-wide smart search)
 */

import { Index } from '@upstash/vector';

// Initialize Upstash Vector Index
// Uses VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL and VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN env vars
const getIndex = () => {
  const url = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL;
  const token = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Upstash Vector not configured. Set VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL and VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN.');
  }

  return new Index({ url, token });
};

// Vector metadata structure (with index signature for Upstash compatibility)
export interface VectorMetadata {
  api_key: string;      // User's API key or "tulzo" for website
  rag_name: string;     // Normalized RAG name (collection identifier, unique per user)
  rag_id?: string;      // Optional: RAG UUID for reference
  doc_id: string;       // Document ID from CSV (required for upsert)
  title?: string;       // Optional: Document title
  content: string;      // The actual text content (original, not embedding text)
  chunk_index?: number; // Optional: Chunk index within document
  source?: string;      // Optional: Source identifier (e.g., "csv:products.csv")
  updated_at?: string;  // ISO timestamp of last update
  [key: string]: string | number | boolean | undefined; // Index signature for dynamic CSV fields
}

// Field configuration for CSV imports
export interface FieldConfig {
  id_column: string;        // Column used as document ID (required)
  document_column: string;  // Main content column (always embedded)
  fields: FieldMapping[];   // Additional field configurations
}

export interface FieldMapping {
  column: string;           // CSV column name
  embed: boolean;           // Include in embedding text
  metadata: boolean;        // Store in vector metadata
  format: string;           // Embedding format template, e.g., "Price: {value}"
}

// Smart formatting presets for common field types
export const FIELD_FORMAT_PRESETS: Record<string, { pattern: RegExp; format: string; description: string }> = {
  price: {
    pattern: /price|cost|amount|fee/i,
    format: 'Price: {value}',
    description: 'Formats as "Price: $X"',
  },
  rating: {
    pattern: /rating|score|stars/i,
    format: 'Rating: {value}/5',
    description: 'Formats as "Rating: X/5"',
  },
  category: {
    pattern: /category|type|kind|genre/i,
    format: 'Category: {value}',
    description: 'Formats as "Category: X"',
  },
  date: {
    pattern: /date|time|created|updated/i,
    format: 'Date: {value}',
    description: 'Formats as "Date: X"',
  },
  location: {
    pattern: /location|city|country|address|place/i,
    format: 'Location: {value}',
    description: 'Formats as "Location: X"',
  },
  brand: {
    pattern: /brand|manufacturer|vendor|company/i,
    format: 'Brand: {value}',
    description: 'Formats as "Brand: X"',
  },
  stock: {
    pattern: /stock|inventory|available|quantity/i,
    format: '{value} in stock',
    description: 'Formats as "X in stock"',
  },
  boolean: {
    pattern: /^(is_|has_|can_|enabled|active|available)$/i,
    format: '{column}: {value}',
    description: 'Formats boolean fields',
  },
};

// Get suggested format for a column name
export function getSuggestedFormat(columnName: string): string {
  const lowerName = columnName.toLowerCase();

  for (const [, preset] of Object.entries(FIELD_FORMAT_PRESETS)) {
    if (preset.pattern.test(lowerName)) {
      return preset.format;
    }
  }

  // Default: just use the value
  return '{value}';
}

// Build embedding text from document data using field config
export function buildEmbeddingText(
  row: Record<string, string>,
  fieldConfig: FieldConfig
): string {
  const parts: string[] = [];

  // Always include document column first
  const documentContent = row[fieldConfig.document_column];
  if (documentContent) {
    parts.push(documentContent.trim());
  }

  // Add formatted fields that are marked for embedding
  for (const field of fieldConfig.fields) {
    if (field.embed && row[field.column]) {
      const value = row[field.column].trim();
      if (value) {
        // Apply format template
        const formatted = field.format
          .replace('{value}', value)
          .replace('{column}', field.column);
        parts.push(formatted);
      }
    }
  }

  return parts.join('. ');
}

// Build metadata object from document data using field config
export function buildMetadata(
  row: Record<string, string>,
  fieldConfig: FieldConfig,
  baseMetadata: { api_key: string; rag_name: string; rag_id?: string; title?: string; source?: string }
): VectorMetadata {
  const metadata: VectorMetadata = {
    api_key: baseMetadata.api_key,
    rag_name: baseMetadata.rag_name,
    rag_id: baseMetadata.rag_id,
    title: baseMetadata.title,
    source: baseMetadata.source,
    doc_id: row[fieldConfig.id_column] || '',
    content: row[fieldConfig.document_column] || '',
    updated_at: new Date().toISOString(),
  };

  // Add fields marked for metadata
  for (const field of fieldConfig.fields) {
    if (field.metadata && row[field.column]) {
      metadata[field.column] = row[field.column];
    }
  }

  return metadata;
}

// Generate vector ID in format: {rag_name}_{api_key}_{doc_id}
export function generateVectorId(ragName: string, apiKey: string, docId: string): string {
  // Sanitize doc_id to be URL-safe
  const safeDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${ragName}_${apiKey}_${safeDocId}`;
}

// Upsert vectors with metadata
export async function upsertVectors(
  vectors: Array<{
    id: string;
    data: string;  // Text to embed (Upstash will generate embeddings)
    metadata: VectorMetadata;
  }>
): Promise<{ success: boolean; count: number }> {
  const index = getIndex();

  // Upstash Vector with hybrid search uses data field for text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await index.upsert(vectors as any);

  return { success: true, count: vectors.length };
}

// Query vectors by api_key and rag_name (collection search)
export async function queryCollection(
  apiKey: string,
  ragName: string,
  query: string,
  topK: number = 5
): Promise<Array<{
  id: string;
  score: number;
  metadata: VectorMetadata;
}>> {
  const index = getIndex();

  const results = await index.query({
    data: query,
    topK,
    includeMetadata: true,
    filter: `api_key = '${apiKey}' AND rag_name = '${ragName}'`,
  });

  return results.map(r => ({
    id: r.id as string,
    score: r.score,
    metadata: r.metadata as unknown as VectorMetadata,
  }));
}

// Query all vectors for a user's API key (cross-collection search)
export async function queryByApiKey(
  apiKey: string,
  query: string,
  topK: number = 10
): Promise<Array<{
  id: string;
  score: number;
  metadata: VectorMetadata;
}>> {
  const index = getIndex();
  
  const results = await index.query({
    data: query,
    topK,
    includeMetadata: true,
    filter: `api_key = '${apiKey}'`,
  });
  
  return results.map(r => ({
    id: r.id as string,
    score: r.score,
    metadata: r.metadata as unknown as VectorMetadata,
  }));
}

// Query website vectors (api_key = "tulzo")
export async function queryWebsite(
  query: string,
  topK: number = 5
): Promise<Array<{
  id: string;
  score: number;
  metadata: VectorMetadata;
}>> {
  return queryByApiKey('tulzo', query, topK);
}

// Delete vectors by api_key and rag_name (delete collection)
export async function deleteCollection(
  apiKey: string,
  ragName: string
): Promise<{ success: boolean }> {
  const index = getIndex();

  // Upstash Vector doesn't support delete by filter directly
  // We need to query and delete by IDs
  const results = await index.query({
    data: '', // Empty query to get all
    topK: 10000, // Get all vectors in collection
    includeMetadata: true,
    filter: `api_key = '${apiKey}' AND rag_name = '${ragName}'`,
  });

  if (results.length > 0) {
    const ids = results.map(r => r.id as string);
    await index.delete(ids);
  }

  return { success: true };
}

// Get all vector IDs in a collection (for orphan detection during upsert)
export async function getCollectionVectorIds(
  apiKey: string,
  ragName: string
): Promise<string[]> {
  const index = getIndex();

  const results = await index.query({
    data: '', // Empty query to get all
    topK: 10000, // Get all vectors in collection
    includeMetadata: false, // We only need IDs
    filter: `api_key = '${apiKey}' AND rag_name = '${ragName}'`,
  });

  return results.map(r => r.id as string);
}

// Delete vectors by their IDs
export async function deleteVectorsByIds(ids: string[]): Promise<{ success: boolean; count: number }> {
  if (ids.length === 0) {
    return { success: true, count: 0 };
  }

  const index = getIndex();

  // Delete in batches of 1000 (Upstash limit)
  const batchSize = 1000;
  let deletedCount = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await index.delete(batch);
    deletedCount += batch.length;
  }

  return { success: true, count: deletedCount };
}

// Check if Upstash Vector is configured
export function isUpstashConfigured(): boolean {
  return !!(process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL && process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN);
}

