import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { ToolInsert, ToolCategory } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Normalize name helper
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

// Generate RAG tool name: rag_{env}-{rag_name}-search
function generateRAGToolName(envName: string, ragName: string): string {
  const normalizedEnv = normalizeName(envName);
  const normalizedRag = normalizeName(ragName);
  return `rag_${normalizedEnv}-${normalizedRag}-search`;
}

// GET - List user's RAGs and active ones
// Query param: context=chat|automation (default: chat)
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const context = searchParams.get('context') || 'chat';

    // Get all RAGs
    const { data: rags, error: rError } = await db
      .from('user_rags')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (rError) {
      console.error('Error fetching RAGs:', rError);
      return NextResponse.json({ error: 'Failed to fetch RAGs' }, { status: 500 });
    }

    // Get active RAGs for the specified context
    const { data: active, error: aError } = await db
      .from('chat_active_rags')
      .select('rag_id, priority')
      .eq('user_id', userId)
      .eq('context', context)
      .order('priority', { ascending: true });

    if (aError) {
      console.error('Error fetching active RAGs:', aError);
    }

    const activeIds = (active || []).map((a: { rag_id: string }) => a.rag_id);

    // Calculate total tokens from active RAGs
    const activeRags = (rags || []).filter((r: { id: string }) => activeIds.includes(r.id));
    const totalTokens = activeRags.reduce((sum: number, r: { total_tokens?: number }) => sum + (r.total_tokens || 0), 0);

    return NextResponse.json({
      rags: rags || [],
      activeIds,
      totalTokens,
    });
  } catch (error) {
    console.error('Error in RAGs GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new RAG
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      ragName,
      description,
      serverDescription,
      sourceUrl,
      sourceType,
      authType,
      authConfig,
      oauth2Config,
      customHeaders,
      hasEmbeddings,
      embeddingModel,
      embeddingDimensions,
      contentType,
      tokenLimit,
      chunkSize,
      chunkOverlap,
      topN,
      icon,
      iconUrl,
      // URL RAG request configuration
      httpMethod,
      paramsLocation,
      requestContentType,
      fieldMapping,
      // Environment and swagger
      environmentName,
      swaggerSpec,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Generate normalized rag_name if not provided
    const normalizedRagName = ragName || name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Build final auth config - merge OAuth2 config if provided
    let finalAuthConfig = authConfig || {};
    if (authType === 'oauth2' && oauth2Config) {
      finalAuthConfig = {
        authorization_endpoint: oauth2Config.authorizationEndpoint,
        token_endpoint: oauth2Config.tokenEndpoint,
        scopes: oauth2Config.scopes,
        use_dcr: oauth2Config.useDcr,
        client_id: oauth2Config.clientId,
        client_secret: oauth2Config.clientSecret,
        registration_endpoint: oauth2Config.registrationEndpoint,
      };
    }

    const { data, error } = await db
      .from('user_rags')
      .insert({
        user_id: userId,
        name: name.trim(),
        rag_name: normalizedRagName,
        description: description?.trim() || null,
        server_description: serverDescription?.trim() || null,
        source_url: sourceUrl || null,
        source_type: sourceType || 'csv',
        auth_type: authType || 'none',
        auth_config: finalAuthConfig,
        custom_headers: customHeaders || {},
        has_embeddings: hasEmbeddings || false,
        embedding_model: embeddingModel || null,
        embedding_dimensions: embeddingDimensions || 384,
        content_type: contentType || 'text',
        token_limit: tokenLimit || 8000,
        chunk_size: chunkSize || 500,
        chunk_overlap: chunkOverlap || 50,
        top_n: topN || 5,
        icon: icon || '📚',
        icon_url: iconUrl || null,
        // URL RAG request configuration
        http_method: httpMethod || 'POST',
        params_location: paramsLocation || 'body',
        request_content_type: requestContentType || 'application/json',
        field_mapping: fieldMapping || { query: 'query', embedding: 'embedding', top_n: 'top_n', dimensions: 'dimensions', model: 'model' },
        // Environment and swagger
        environment_name: environmentName || 'default',
        swagger_spec: swaggerSpec || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating RAG:', error);
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'A RAG with this name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create RAG' }, { status: 500 });
    }

    // Create tool for the RAG
    const toolName = generateRAGToolName(environmentName || 'default', normalizedRagName);
    const toolCategory: ToolCategory = 'Utilities';

    const toolInsert: ToolInsert = {
      name: toolName,
      description: description?.trim() || `Search ${name} knowledge base`,
      category: toolCategory,
      categories: ['RAG', 'Search'],
      tool_type: 'RAG',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text',
          },
          top_n: {
            type: 'integer',
            description: 'Number of results to return',
            default: topN || 5,
          },
        },
        required: ['query'],
      },
      output_schema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                score: { type: 'number' },
                metadata: { type: 'object' },
              },
            },
          },
        },
      },
      has_widget: false,
      invoking_message: `Searching ${name}...`,
      invoked_message: 'Search complete',
      user_id: userId,
    };

    const { data: toolData, error: toolError } = await db
      .from('tools')
      .upsert(toolInsert as never, { onConflict: 'name' })
      .select()
      .single();

    if (toolError) {
      console.error('Error creating RAG tool:', toolError);
      // Don't fail the RAG creation, just log the error
    }

    return NextResponse.json({
      rag: data,
      tool: toolData || null,
      toolName: toolData ? toolName : null,
    });
  } catch (error) {
    console.error('Error in RAGs POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update a RAG
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      name,
      description,
      sourceUrl,
      sourceType,
      authType,
      authConfig,
      customHeaders,
      hasEmbeddings,
      embeddingModel,
      tokenLimit,
      chunkSize,
      chunkOverlap,
      topN,
      icon,
      iconUrl,
      isEnabled,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (sourceUrl !== undefined) updates.source_url = sourceUrl || null;
    if (sourceType !== undefined) updates.source_type = sourceType;
    if (authType) updates.auth_type = authType;
    if (authConfig) updates.auth_config = authConfig;
    if (customHeaders) updates.custom_headers = customHeaders;
    if (hasEmbeddings !== undefined) updates.has_embeddings = hasEmbeddings;
    if (embeddingModel !== undefined) updates.embedding_model = embeddingModel;
    if (tokenLimit !== undefined) updates.token_limit = tokenLimit;
    if (chunkSize !== undefined) updates.chunk_size = chunkSize;
    if (chunkOverlap !== undefined) updates.chunk_overlap = chunkOverlap;
    if (topN !== undefined) updates.top_n = topN;
    if (icon) updates.icon = icon;
    if (iconUrl !== undefined) updates.icon_url = iconUrl;
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;

    const { data, error } = await db
      .from('user_rags')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating RAG:', error);
      return NextResponse.json({ error: 'Failed to update RAG' }, { status: 500 });
    }

    return NextResponse.json({ rag: data });
  } catch (error) {
    console.error('Error in RAGs PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a RAG
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    const { error } = await db
      .from('user_rags')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting RAG:', error);
      return NextResponse.json({ error: 'Failed to delete RAG' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in RAGs DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
