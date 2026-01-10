/**
 * POST /api/a2a/messages
 * 
 * Save A2A agent messages to a conversation for history persistence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface SaveMessagesRequest {
  conversationId?: string;
  modelId: string; // e.g., "agent:connector-id"
  userMessage: string;
  assistantMessage: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body: SaveMessagesRequest = await request.json();
    const { conversationId, modelId, userMessage, assistantMessage, inputTokens, outputTokens } = body;

    let activeConversationId = conversationId;

    // Create new conversation if needed
    if (!activeConversationId) {
      const title = userMessage.length > 50
        ? userMessage.substring(0, 47) + '...'
        : userMessage;

      const { data: newConv, error: convError } = await supabase
        .from('chat_conversations')
        .insert({
          user_id: userId,
          title,
          model_id: modelId,
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }

      activeConversationId = newConv?.id;
    }

    if (!activeConversationId) {
      return NextResponse.json({ error: 'Failed to get conversation ID' }, { status: 500 });
    }

    // Save user message
    const { error: userMsgError } = await supabase.from('chat_messages').insert({
      conversation_id: activeConversationId,
      role: 'user',
      content: userMessage,
      input_tokens: inputTokens || 0,
      output_tokens: 0,
    });

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
    }

    // Save assistant message
    const { error: assistantMsgError } = await supabase.from('chat_messages').insert({
      conversation_id: activeConversationId,
      role: 'assistant',
      content: assistantMessage,
      model_id: modelId,
      input_tokens: 0,
      output_tokens: outputTokens || 0,
    });

    if (assistantMsgError) {
      console.error('Error saving assistant message:', assistantMsgError);
    }

    // Update conversation message count and tokens
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('message_count, total_tokens')
      .eq('id', activeConversationId)
      .single();

    await supabase
      .from('chat_conversations')
      .update({
        message_count: (conv?.message_count || 0) + 2,
        total_tokens: (conv?.total_tokens || 0) + (inputTokens || 0) + (outputTokens || 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeConversationId);

    return NextResponse.json({
      success: true,
      conversationId: activeConversationId,
    });
  } catch (error) {
    console.error('Error saving A2A messages:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to save messages',
    }, { status: 500 });
  }
}

