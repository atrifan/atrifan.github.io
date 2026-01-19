/**
 * Upload Website Embeddings to Upstash Vector
 *
 * This script reads the website embeddings JSON and upserts them to Upstash Vector
 * with user_id="tulzo" for the website smart search feature.
 *
 * Usage:
 *   npx tsx scripts/upload-website-embeddings.ts
 *
 * Or with ts-node:
 *   npx ts-node --esm scripts/upload-website-embeddings.ts
 *
 * Make sure VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL and VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN
 * are set in your environment (or .env.local file).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { Index } from '@upstash/vector';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

interface EmbeddingEntry {
  id: string;
  title: string;
  link: string;
  content: string;
}

interface EmbeddingsData {
  user_id: string;
  rag_name: string;
  description: string;
  entries: EmbeddingEntry[];
}

interface VectorMetadata {
  user_id: string;
  rag_name: string;
  title: string;
  content: string;
  source: string;
  [key: string]: string | number | boolean | undefined;
}

async function main() {
  // Check environment variables
  const url = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL;
  const token = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) {
    console.error('❌ Missing environment variables:');
    console.error('   VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL');
    console.error('   VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN');
    console.error('\nMake sure these are set in .env.local');
    process.exit(1);
  }

  console.log('📦 Loading embeddings data...');

  // Read the JSON file
  const jsonPath = resolve(process.cwd(), 'data/tulzo-website-embeddings.json');
  const rawData = readFileSync(jsonPath, 'utf-8');
  const data: EmbeddingsData = JSON.parse(rawData);

  console.log(`   Found ${data.entries.length} entries`);
  console.log(`   User ID: ${data.user_id}`);
  console.log(`   RAG Name: ${data.rag_name}`);

  // Initialize Upstash Vector
  const index = new Index({ url, token });

  // Prepare vectors
  const vectors = data.entries.map(entry => ({
    id: entry.id,
    data: entry.content, // Upstash generates embeddings from text
    metadata: {
      user_id: data.user_id,
      rag_name: data.rag_name,
      title: entry.title,
      content: entry.content,
      source: entry.link,
    } as VectorMetadata,
  }));

  console.log('\n🚀 Uploading to Upstash Vector...');

  // Upsert in batches of 50
  const batchSize = 50;
  let uploaded = 0;

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await index.upsert(batch as any);
    
    uploaded += batch.length;
    console.log(`   ✓ Uploaded ${uploaded}/${vectors.length} vectors`);
  }

  console.log('\n✅ Done! Website embeddings uploaded successfully.');
  console.log(`\n📍 You can now search via:`);
  console.log(`   GET /api/search?q=your+query`);
  console.log(`   POST /api/search with {"query": "your query"}`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

