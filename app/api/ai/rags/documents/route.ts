import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Estimate token count (rough: ~4 chars per token)
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// GET - List documents for a RAG
// Query param: ragId
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ragId = searchParams.get('ragId');

    if (!ragId) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    // Verify RAG belongs to user
    const { data: rag } = await db
      .from('user_rags')
      .select('id')
      .eq('id', ragId)
      .eq('user_id', userId)
      .single();

    if (!rag) {
      return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
    }

    const { data: documents, error } = await db
      .from('rag_documents')
      .select('id, title, source_identifier, chunk_index, total_chunks, token_count, created_at')
      .eq('rag_id', ragId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (error) {
    console.error('Error in documents GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add documents to a RAG (from CSV or manual input)
// Body: { ragId, documents: [{ title?, content, sourceIdentifier?, metadata? }] }
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ragId, documents } = body;

    if (!ragId) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: 'Documents array required' }, { status: 400 });
    }

    // Verify RAG belongs to user
    const { data: rag } = await db
      .from('user_rags')
      .select('id, chunk_size, chunk_overlap')
      .eq('id', ragId)
      .eq('user_id', userId)
      .single();

    if (!rag) {
      return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
    }

    // Insert documents
    const docsToInsert = documents.map((doc: { title?: string; content: string; sourceIdentifier?: string; metadata?: Record<string, unknown> }) => ({
      rag_id: ragId,
      user_id: userId,
      title: doc.title || null,
      content: doc.content,
      source_identifier: doc.sourceIdentifier || null,
      token_count: estimateTokens(doc.content),
      metadata: doc.metadata || {},
    }));

    const { data, error } = await db
      .from('rag_documents')
      .insert(docsToInsert)
      .select();

    if (error) {
      console.error('Error inserting documents:', error);
      return NextResponse.json({ error: 'Failed to insert documents' }, { status: 500 });
    }

    // Update RAG stats
    const totalTokens = docsToInsert.reduce((sum: number, d: { token_count: number }) => sum + d.token_count, 0);
    await db
      .from('user_rags')
      .update({
        document_count: db.raw(`document_count + ${docsToInsert.length}`),
        total_tokens: db.raw(`total_tokens + ${totalTokens}`),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ragId);

    return NextResponse.json({ documents: data, count: docsToInsert.length });
  } catch (error) {
    console.error('Error in documents POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a document or all documents for a RAG
// Query params: id (single doc) or ragId (all docs)
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');
    const ragId = searchParams.get('ragId');

    if (!docId && !ragId) {
      return NextResponse.json({ error: 'Document ID or RAG ID required' }, { status: 400 });
    }

    if (docId) {
      // Delete single document
      const { error } = await db
        .from('rag_documents')
        .delete()
        .eq('id', docId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting document:', error);
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
      }
    } else if (ragId) {
      // Verify RAG belongs to user
      const { data: rag } = await db
        .from('user_rags')
        .select('id')
        .eq('id', ragId)
        .eq('user_id', userId)
        .single();

      if (!rag) {
        return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
      }

      // Delete all documents for this RAG
      const { error } = await db
        .from('rag_documents')
        .delete()
        .eq('rag_id', ragId);

      if (error) {
        console.error('Error deleting documents:', error);
        return NextResponse.json({ error: 'Failed to delete documents' }, { status: 500 });
      }

      // Reset RAG stats
      await db
        .from('user_rags')
        .update({
          document_count: 0,
          total_tokens: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ragId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in documents DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
