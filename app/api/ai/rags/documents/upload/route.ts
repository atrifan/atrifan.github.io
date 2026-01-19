import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import {
  upsertVectors,
  isUpstashConfigured,
  VectorMetadata,
  FieldConfig,
  FieldMapping,
  buildEmbeddingText,
  buildMetadata,
  generateVectorId,
  getCollectionVectorIds,
  deleteVectorsByIds,
} from '@/src/lib/upstash-vector';

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

// Parse CSV row into object with headers as keys
function parseRowToObject(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((header, idx) => {
    obj[header] = row[idx] || '';
  });
  return obj;
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
    const ragNameParam = formData.get('ragName') as string | null;

    // New field configuration
    const idColumn = formData.get('idColumn') as string | null;
    const contentColumn = formData.get('contentColumn') as string | null;
    const titleColumn = formData.get('titleColumn') as string | null;
    const fieldMappingsStr = formData.get('fieldMappings') as string | null;

    // Legacy fields (for backward compatibility)
    const hasEmbeddings = formData.get('hasEmbeddings') === 'true';
    const embeddingColumn = formData.get('embeddingColumn') as string | null;

    // Parse field mappings
    let fieldMappings: FieldMapping[] = [];
    if (fieldMappingsStr) {
      try {
        fieldMappings = JSON.parse(fieldMappingsStr);
      } catch {
        console.warn('Failed to parse field mappings, using empty array');
      }
    }

    if (!file) {
      return NextResponse.json({ error: 'File required' }, { status: 400 });
    }

    if (!ragId) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    if (!contentColumn) {
      return NextResponse.json({ error: 'Content column required' }, { status: 400 });
    }

    if (!idColumn) {
      return NextResponse.json({ error: 'ID column required' }, { status: 400 });
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

    // Use userId as the namespace for Upstash vectors (stable identifier)
    const userApiKey = userId;
    // Use provided ragName, or rag_name from DB, or normalize the name
    const ragName = ragNameParam || rag.rag_name || rag.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Build field config
    const fieldConfig: FieldConfig = {
      id_column: idColumn,
      document_column: contentColumn,
      fields: fieldMappings,
    };

    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have header and at least one data row' }, { status: 400 });
    }

    const headers = parseCSVLine(lines[0]);
    const idIndex = headers.indexOf(idColumn);
    const contentIndex = headers.indexOf(contentColumn);
    const titleIndex = titleColumn ? headers.indexOf(titleColumn) : -1;
    const embeddingIndex = hasEmbeddings && embeddingColumn ? headers.indexOf(embeddingColumn) : -1;

    if (idIndex === -1) {
      return NextResponse.json({ error: `ID column "${idColumn}" not found` }, { status: 400 });
    }

    if (contentIndex === -1) {
      return NextResponse.json({ error: `Content column "${contentColumn}" not found` }, { status: 400 });
    }

    // Validate unique IDs
    const docIds = new Set<string>();
    const duplicateIds: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const docId = row[idIndex]?.trim();
      if (docId) {
        if (docIds.has(docId)) {
          duplicateIds.push(docId);
        }
        docIds.add(docId);
      }
    }

    if (duplicateIds.length > 0) {
      return NextResponse.json({
        error: `Duplicate IDs found: ${duplicateIds.slice(0, 5).join(', ')}${duplicateIds.length > 5 ? '...' : ''}`
      }, { status: 400 });
    }

    // Parse rows and create documents with new field config
    const documents: Array<{
      rag_id: string;
      user_id: string;
      doc_id: string;
      title: string | null;
      content: string;
      source_identifier: string;
      token_count: number;
      embedding: number[] | null;
      metadata: Record<string, unknown>;
    }> = [];

    // Track document IDs for this import
    const importedDocIds: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const rowData = parseRowToObject(headers, row);

      const docId = rowData[idColumn]?.trim();
      const content = rowData[contentColumn]?.trim();

      if (!docId || !content) continue;

      const title = titleColumn ? rowData[titleColumn] : null;
      let embedding: number[] | null = null;

      if (embeddingIndex >= 0 && row[embeddingIndex]) {
        try {
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

      // Build metadata from field mappings
      const docMetadata: Record<string, unknown> = {
        row: i,
        source: file.name,
      };
      for (const field of fieldMappings) {
        if (field.metadata && rowData[field.column]) {
          docMetadata[field.column] = rowData[field.column];
        }
      }

      documents.push({
        rag_id: ragId,
        user_id: userId,
        doc_id: docId,
        title: title || null,
        content: content,
        source_identifier: `csv:${file.name}:${docId}`,
        token_count: estimateTokens(content),
        embedding,
        metadata: docMetadata,
      });

      importedDocIds.push(docId);
    }

    if (documents.length === 0) {
      return NextResponse.json({ error: 'No valid documents found in CSV' }, { status: 400 });
    }

    // Upsert documents in Supabase (delete existing, then insert)
    const batchSize = 100;
    let insertedCount = 0;
    let updatedCount = 0;
    let totalTokens = 0;

    // First, find existing documents with these doc_ids
    const { data: existingDocs } = await db
      .from('rag_documents')
      .select('id, doc_id')
      .eq('rag_id', ragId)
      .in('doc_id', importedDocIds);

    const existingDocIds = new Set((existingDocs || []).map((d: { doc_id: string }) => d.doc_id));
    updatedCount = existingDocIds.size;

    // Delete existing documents that will be replaced
    if (existingDocs && existingDocs.length > 0) {
      const idsToDelete = existingDocs.map((d: { id: string }) => d.id);
      await db.from('rag_documents').delete().in('id', idsToDelete);
    }

    // Insert all documents
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
    let deletedVectorCount = 0;

    if (isUpstashConfigured()) {
      try {
        // Get existing vector IDs for this collection
        const existingVectorIds = await getCollectionVectorIds(userApiKey, ragName);

        // Build new vector IDs
        const newVectorIds = new Set(
          documents.map(doc => generateVectorId(ragName, userApiKey, doc.doc_id))
        );

        // Find orphaned vectors (in Upstash but not in new CSV)
        const orphanedVectorIds = existingVectorIds.filter(id => !newVectorIds.has(id));

        // Delete orphaned vectors
        if (orphanedVectorIds.length > 0) {
          const deleteResult = await deleteVectorsByIds(orphanedVectorIds);
          deletedVectorCount = deleteResult.count;
          console.log(`Deleted ${deletedVectorCount} orphaned vectors from Upstash`);
        }

        // Prepare vectors for Upstash with composite embedding text
        const vectors = documents.map((doc) => {
          const rowData = parseRowToObject(headers, parseCSVLine(
            lines[documents.indexOf(doc) + 1] // +1 to skip header
          ));

          // Build embedding text using field config
          const embeddingText = buildEmbeddingText(rowData, fieldConfig);

          // Build metadata
          const metadata = buildMetadata(rowData, fieldConfig, {
            api_key: userApiKey,
            rag_name: ragName,
            rag_id: ragId,
            title: doc.title || undefined,
            source: doc.source_identifier,
          });

          return {
            id: generateVectorId(ragName, userApiKey, doc.doc_id),
            data: embeddingText, // Composite text for embedding
            metadata,
          };
        });

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

    // Record import history
    await db.from('rag_import_history').insert({
      rag_id: ragId,
      user_id: userId,
      filename: file.name,
      row_count: lines.length - 1,
      vector_count: vectorCount,
      document_ids: importedDocIds,
      field_config: fieldConfig,
      inserted_count: insertedCount - updatedCount,
      updated_count: updatedCount,
      deleted_count: deletedVectorCount,
    });

    // Update RAG stats (replace counts, not add)
    await db
      .from('user_rags')
      .update({
        document_count: documents.length,
        total_tokens: totalTokens,
        chunk_count: vectorCount,
        field_config: fieldConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ragId);

    return NextResponse.json({
      success: true,
      count: insertedCount,
      inserted: insertedCount - updatedCount,
      updated: updatedCount,
      deleted: deletedVectorCount,
      totalTokens,
      vectorCount,
    });
  } catch (error) {
    console.error('Error in documents upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

