/**
 * Upstash Vector Debug Script
 * 
 * Usage:
 *   npx tsx scripts/upstash-debug.ts list [prefix]     - List vectors with optional prefix
 *   npx tsx scripts/upstash-debug.ts query <text>      - Query vectors with text
 *   npx tsx scripts/upstash-debug.ts info              - Get index info
 *   npx tsx scripts/upstash-debug.ts fetch <id>        - Fetch specific vector by ID
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

async function listVectors(prefix?: string) {
  console.log(`\n📋 Listing vectors${prefix ? ` with prefix: ${prefix}` : ''}...\n`);

  let cursor: string | number = 0;
  let totalCount = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const rangeResult: { vectors: Array<{ id: string | number; metadata?: Record<string, unknown> }>; nextCursor: string | number } = await index.range({
      cursor,
      limit,
      prefix: prefix || undefined,
      includeMetadata: true,
      includeVectors: false,
    });

    for (const vector of rangeResult.vectors) {
      totalCount++;
      const meta = (vector.metadata || {}) as Record<string, unknown>;
      console.log(`[${totalCount}] ID: ${vector.id}`);
      console.log(`    metadata: ${JSON.stringify(meta, null, 2).split('\n').join('\n    ')}`);
      console.log('');
    }

    const nextCursor = rangeResult.nextCursor;
    if (nextCursor === '' || nextCursor === '0' || nextCursor === 0) {
      hasMore = false;
    } else {
      cursor = nextCursor;
    }
  }

  console.log(`\n✅ Total vectors: ${totalCount}`);
}

async function queryVectors(queryText: string, filter?: string) {
  console.log(`\n🔍 Querying: "${queryText}"${filter ? ` with filter: ${filter}` : ''}...\n`);
  
  const results = await index.query({
    data: queryText,
    topK: 10,
    includeMetadata: true,
    filter: filter || undefined,
  });
  
  if (results.length === 0) {
    console.log('No results found.');
  } else {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const meta = (r.metadata || {}) as Record<string, unknown>;
      console.log(`[${i + 1}] Score: ${r.score.toFixed(4)}`);
      console.log(`    ID: ${r.id}`);
      console.log(`    metadata: ${JSON.stringify(meta, null, 2).split('\n').join('\n    ')}`);
      console.log('');
    }
  }
  
  console.log(`\n✅ Found ${results.length} results`);
}

async function getInfo() {
  console.log('\n📊 Index Info:\n');
  const info = await index.info();
  console.log(JSON.stringify(info, null, 2));
}

async function fetchVector(id: string) {
  console.log(`\n🔎 Fetching vector: ${id}\n`);
  const result = await index.fetch([id], { includeMetadata: true, includeVectors: false });
  
  if (!result || result.length === 0 || !result[0]) {
    console.log('Vector not found.');
  } else {
    console.log(JSON.stringify(result[0], null, 2));
  }
}

async function main() {
  const [, , command, ...args] = process.argv;
  
  switch (command) {
    case 'list':
      await listVectors(args[0]);
      break;
    case 'query':
      await queryVectors(args.join(' '), args.includes('--filter') ? args[args.indexOf('--filter') + 1] : undefined);
      break;
    case 'info':
      await getInfo();
      break;
    case 'fetch':
      await fetchVector(args[0]);
      break;
    default:
      console.log(`
Upstash Vector Debug Script

Usage:
  npx tsx scripts/upstash-debug.ts list [prefix]     - List vectors with optional prefix
  npx tsx scripts/upstash-debug.ts query <text>      - Query vectors with text
  npx tsx scripts/upstash-debug.ts info              - Get index info
  npx tsx scripts/upstash-debug.ts fetch <id>        - Fetch specific vector by ID
      `);
  }
}

main().catch(console.error);

