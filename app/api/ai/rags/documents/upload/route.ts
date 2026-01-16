import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { upsertVectors, isUpstashConfigured, VectorMetadata } from '@/src/lib/upstash-vector';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Estimate token count (rough: ~4 chars per token)
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// POST - Upload CSV file and create documents
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const ragId = formData.get('ragId') as string | null;
    const contentColumn = formData.get('contentColumn') as string | null;
    const titleColumn = formData.get('titleColumn') as string | null;
    const hasEmbeddings = formData.get('hasEmbeddings') === 'true';
    const embeddingColumn = formData.get('embeddingColumn') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File required' }, { status: 400 });
    }

    if (!ragId) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    if (!contentColumn) {
      return NextResponse.json({ error: 'Content column required' }, { status: 400 });
    }

    // Verify RAG belongs to user and get rag_name
    const { data: rag } = await db
      .from('user_rags')
      .select('id, chunk_size, chunk_overlap, rag_name, name')
      .eq('id', ragId)
      .eq('user_id', userId)
      .single();

    if (!rag) {
      return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
    }

    // Get user's API key for Upstash metadata
    const { data: userApiKeyData } = await db
      .from('user_api_keys')
      .select('api_key')
      .eq('user_id', userId)
      .single();

    if (!userApiKeyData?.api_key) {
      return NextResponse.json({ error: 'API key not found. Please generate an API key first.' }, { status: 400 });
    }

    const userApiKey = userApiKeyData.api_key;
    // Use rag_name if available, otherwise normalize the name
    const ragName = rag.rag_name || rag.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have header and at least one data row' }, { status: 400 });
    }

    const headers = parseCSVLine(lines[0]);
    const contentIndex = headers.indexOf(contentColumn);
    const titleIndex = titleColumn ? headers.indexOf(titleColumn) : -1;
    const embeddingIndex = hasEmbeddings && embeddingColumn ? headers.indexOf(embeddingColumn) : -1;

    if (contentIndex === -1) {
      return NextResponse.json({ error: `Content column "${contentColumn}" not found` }, { status: 400 });
    }

    // Parse rows and create documents
    const documents: Array<{
      rag_id: string;
      user_id: string;
      title: string | null;
      content: string;
      source_identifier: string;
      token_count: number;
      embedding: number[] | null;
      metadata: Record<string, unknown>;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const content = row[contentIndex];
      
      if (!content || !content.trim()) continue;

      const title = titleIndex >= 0 ? row[titleIndex] : null;
      let embedding: number[] | null = null;

      if (embeddingIndex >= 0 && row[embeddingIndex]) {
        try {
          // Parse embedding - could be JSON array or comma-separated
          const embStr = row[embeddingIndex].trim();
          if (embStr.startsWith('[')) {
            embedding = JSON.parse(embStr);
          } else {
            embedding = embStr.split(',').map(Number);
          }
        } catch {
          console.warn(`Failed to parse embedding for row ${i}`);
        }
      }

      documents.push({
        rag_id: ragId,
        user_id: userId,
        title: title || null,
        content: content.trim(),
        source_identifier: `csv:${file.name}:row${i}`,
        token_count: estimateTokens(content),
        embedding,
        metadata: { row: i, source: file.name },
      });
    }

    if (documents.length === 0) {
      return NextResponse.json({ error: 'No valid documents found in CSV' }, { status: 400 });
    }

    // Insert in batches of 100
    const batchSize = 100;
    let insertedCount = 0;
    let totalTokens = 0;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const { error } = await db
        .from('rag_documents')
        .insert(batch);

      if (error) {
        console.error('Error inserting documents batch:', error);
        return NextResponse.json({ 
          error: 'Failed to insert documents', 
          inserted: insertedCount 
        }, { status: 500 });
      }

      insertedCount += batch.length;
      totalTokens += batch.reduce((sum, d) => sum + d.token_count, 0);
    }

    // Upload to Upstash Vector if configured
    let vectorCount = 0;
    if (isUpstashConfigured()) {
      try {
        // Prepare vectors for Upstash (using text data for hybrid search)
        const vectors = documents.map((doc, idx) => ({
          id: `${ragId}-${idx}`,
          data: doc.content, // Upstash will generate embeddings
          metadata: {
            api_key: userApiKey,
            rag_name: ragName,
            rag_id: ragId,
            title: doc.title || undefined,
            content: doc.content,
            chunk_index: idx,
            source: doc.source_identifier,
          } as VectorMetadata,
        }));

        // Upsert in batches of 100
        for (let i = 0; i < vectors.length; i += batchSize) {
          const batch = vectors.slice(i, i + batchSize);
          await upsertVectors(batch);
          vectorCount += batch.length;
        }
        console.log(`Uploaded ${vectorCount} vectors to Upstash for RAG ${ragName}`);
      } catch (upstashError) {
        console.error('Error uploading to Upstash Vector:', upstashError);
        // Don't fail the request, just log the error
      }
    }

    // Update RAG stats
    const { data: currentRag } = await db
      .from('user_rags')
      .select('document_count, total_tokens, chunk_count')
      .eq('id', ragId)
      .single();

    await db
      .from('user_rags')
      .update({
        document_count: (currentRag?.document_count || 0) + insertedCount,
        total_tokens: (currentRag?.total_tokens || 0) + totalTokens,
        chunk_count: (currentRag?.chunk_count || 0) + vectorCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ragId);

    return NextResponse.json({
      success: true,
      count: insertedCount,
      totalTokens,
      vectorCount,
    });
  } catch (error) {
    console.error('Error in documents upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

