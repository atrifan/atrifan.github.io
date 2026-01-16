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
  rag_name: string;     // Normalized RAG name (collection identifier)
  rag_id?: string;      // Optional: RAG UUID for reference
  doc_id?: string;      // Optional: Document UUID for reference
  title?: string;       // Optional: Document title
  content: string;      // The actual text content
  chunk_index?: number; // Optional: Chunk index within document
  source?: string;      // Optional: Source identifier
  [key: string]: string | number | boolean | undefined; // Index signature for Upstash Dict
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

// Check if Upstash Vector is configured
export function isUpstashConfigured(): boolean {
  return !!(process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL && process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN);
}

