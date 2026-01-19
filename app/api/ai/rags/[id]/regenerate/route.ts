import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import {
  upsertVectors,
  isUpstashConfigured,
  FieldConfig,
  buildEmbeddingText,
  buildMetadata,
  generateVectorId,
} from '@/src/lib/upstash-vector';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RagDocument {
  id: string;
  doc_id: string;
  title: string | null;
  content: string;
  source_identifier: string;
  metadata: Record<string, unknown>;
}

// POST - Regenerate embeddings with updated field config
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: ragId } = await context.params;
    const body = await request.json();
    const { fieldConfig } = body as { fieldConfig?: FieldConfig };

    // Get the RAG
    const { data: rag, error: ragError } = await db
      .from('user_rags')
      .select('id, rag_name, name, field_config')
      .eq('id', ragId)
      .eq('user_id', userId)
      .single();

    if (ragError || !rag) {
      return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
    }

    // Use provided fieldConfig or existing one
    const config: FieldConfig = fieldConfig || rag.field_config;
    if (!config || !config.document_column) {
      return NextResponse.json({ error: 'No field configuration found' }, { status: 400 });
    }

    // Check Upstash is configured
    if (!isUpstashConfigured()) {
      return NextResponse.json({ error: 'Upstash Vector not configured' }, { status: 500 });
    }

    // Get all documents for this RAG
    const { data: documents, error: docsError } = await db
      .from('rag_documents')
      .select('id, doc_id, title, content, source_identifier, metadata')
      .eq('rag_id', ragId);

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No documents found to regenerate' }, { status: 400 });
    }

    const userApiKey = userId;
    const ragName = rag.rag_name;

    // Build vectors from documents using new field config
    const vectors = (documents as RagDocument[]).map((doc) => {
      // Reconstruct row data from document metadata + content
      const rowData: Record<string, string> = {
        [config.document_column]: doc.content,
      };

      // Add metadata fields back to rowData
      if (doc.metadata) {
        for (const [key, value] of Object.entries(doc.metadata)) {
          if (typeof value === 'string' || typeof value === 'number') {
            rowData[key] = String(value);
          }
        }
      }

      // Build embedding text using field config
      const embeddingText = buildEmbeddingText(rowData, config);

      // Build metadata
      const metadata = buildMetadata(rowData, config, {
        api_key: userApiKey,
        rag_name: ragName,
        rag_id: ragId,
        title: doc.title || undefined,
        source: doc.source_identifier,
      });

      return {
        id: generateVectorId(ragName, userApiKey, doc.doc_id),
        data: embeddingText,
        metadata,
      };
    });

    // Upsert vectors in batches
    const batchSize = 100;
    let vectorCount = 0;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await upsertVectors(batch);
      vectorCount += batch.length;
    }

    // Update RAG with new field config
    await db
      .from('user_rags')
      .update({
        field_config: config,
        chunk_count: vectorCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ragId);

    return NextResponse.json({
      success: true,
      vectorCount,
      message: `Regenerated ${vectorCount} embeddings`,
    });
  } catch (error) {
    console.error('Error regenerating embeddings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

