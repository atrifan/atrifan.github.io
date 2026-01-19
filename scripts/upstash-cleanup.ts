/**
 * Upstash Vector Cleanup Script
 * 
 * Deletes vectors that don't have user_id="tulzo" (old api_key based vectors)
 * 
 * Usage:
 *   npx tsx scripts/upstash-cleanup.ts --dry-run    - Preview what would be deleted
 *   npx tsx scripts/upstash-cleanup.ts --delete     - Actually delete the vectors
 */

import { Index } from '@upstash/vector';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const UPSTASH_URL = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL;
const UPSTASH_TOKEN = process.env.VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('❌ Missing Upstash credentials. Set VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL and VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN');
  process.exit(1);
}

const index = new Index({
  url: UPSTASH_URL,
  token: UPSTASH_TOKEN,
});

async function getAllVectors(): Promise<Array<{ id: string; metadata: Record<string, unknown> }>> {
  const allVectors: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  let cursor: string | number = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const rangeResult: { vectors: Array<{ id: string | number; metadata?: Record<string, unknown> }>; nextCursor: string | number } = await index.range({
      cursor,
      limit,
      includeMetadata: true,
      includeVectors: false,
    });

    for (const vector of rangeResult.vectors) {
      allVectors.push({
        id: String(vector.id),
        metadata: (vector.metadata || {}) as Record<string, unknown>,
      });
    }

    const nextCursor = rangeResult.nextCursor;
    if (nextCursor === '' || nextCursor === '0' || nextCursor === 0) {
      hasMore = false;
    } else {
      cursor = nextCursor;
    }
  }

  return allVectors;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const doDelete = args.includes('--delete');
  
  if (!isDryRun && !doDelete) {
    console.log(`
Upstash Vector Cleanup Script

Usage:
  npx tsx scripts/upstash-cleanup.ts --dry-run    - Preview what would be deleted
  npx tsx scripts/upstash-cleanup.ts --delete     - Actually delete the vectors

This script deletes vectors that:
  - Have api_key field (old format) instead of user_id
  - Have user_id that is NOT "tulzo"
    `);
    return;
  }

  console.log('\n📋 Fetching all vectors from Upstash...\n');
  const allVectors = await getAllVectors();
  console.log(`Found ${allVectors.length} total vectors\n`);

  // Categorize vectors
  const toDelete: string[] = [];
  const toKeep: string[] = [];

  for (const vector of allVectors) {
    const meta = vector.metadata;
    const userId = meta.user_id as string | undefined;
    const apiKey = meta.api_key as string | undefined;

    // Keep ONLY vectors with user_id = "tulzo"
    // Delete everything else (old api_key format, other users, malformed)
    if (userId === 'tulzo' && !apiKey) {
      toKeep.push(vector.id);
    } else {
      toDelete.push(vector.id);
      console.log(`❌ DELETE: ${vector.id}`);
      console.log(`   api_key: ${apiKey || 'N/A'}, user_id: ${userId || 'N/A'}, rag_name: ${meta.rag_name || 'N/A'}`);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   To keep: ${toKeep.length}`);
  console.log(`   To delete: ${toDelete.length}`);
  
  if (isDryRun) {
    console.log(`\n🔍 DRY RUN - No vectors were deleted.`);
    console.log(`   Run with --delete to actually delete these vectors.`);
    return;
  }
  
  if (doDelete && toDelete.length > 0) {
    console.log(`\n🗑️  Deleting ${toDelete.length} vectors...`);
    
    // Delete in batches of 1000
    const batchSize = 1000;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      await index.delete(batch);
      console.log(`   Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(toDelete.length / batchSize)}`);
    }
    
    console.log(`\n✅ Deleted ${toDelete.length} vectors.`);
  } else if (doDelete) {
    console.log(`\n✅ No vectors to delete.`);
  }
}

main().catch(console.error);

