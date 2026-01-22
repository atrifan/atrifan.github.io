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

/**
 * RAG context data for A2A messages
 */
interface RAGContextItem {
  source: string;
  title: string;
  content: string;
  score?: number;
}

/**
 * History correlation data for A2A messages
 */
interface HistoryMatchItem {
  conversationId: string;
  summary: string;
  relevance?: number;
}

/**
 * Persona prompt data for A2A messages
 */
interface PersonaItem {
  name: string;
  prompt: string;
}

interface SaveMessagesRequest {
  conversationId?: string;
  modelId: string; // e.g., "agent:connector-id"
  userMessage: string;
  assistantMessage: string;
  inputTokens?: number;
  outputTokens?: number;
  a2aContextId?: string; // External agent's context/task ID
  ragData?: RAGContextItem[]; // RAG context sent to agent
  historyData?: HistoryMatchItem[]; // History context sent to agent
  personaPrompts?: PersonaItem[]; // Persona prompts sent to agent
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
    const { conversationId, modelId, userMessage, assistantMessage, inputTokens, outputTokens, a2aContextId, ragData, historyData, personaPrompts } = body;

    let activeConversationId = conversationId;

    // Create new conversation if needed
    if (!activeConversationId) {
      const title = userMessage.length > 50
        ? userMessage.substring(0, 47) + '...'
        : userMessage;

      const insertData: Record<string, unknown> = {
        user_id: userId,
        title,
        model_id: modelId,
      };
      if (a2aContextId) {
        insertData.a2a_context_id = a2aContextId;
      }

      const { data: newConv, error: convError } = await supabase
        .from('chat_conversations')
        .insert(insertData)
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }

      activeConversationId = newConv?.id;
    } else if (a2aContextId) {
      // Update existing conversation with a2a_context_id if provided
      await supabase
        .from('chat_conversations')
        .update({ a2a_context_id: a2aContextId })
        .eq('id', activeConversationId);
    }

    if (!activeConversationId) {
      return NextResponse.json({ error: 'Failed to get conversation ID' }, { status: 500 });
    }

    // Save user message with context data
    // Build the message insert data
    const userMsgData: Record<string, unknown> = {
      conversation_id: activeConversationId,
      role: 'user',
      content: userMessage,
      input_tokens: inputTokens || 0,
      output_tokens: 0,
    };

    // Add RAG data if provided
    if (ragData && ragData.length > 0) {
      userMsgData.rag_data = ragData;
    }

    // Add history data if provided
    if (historyData && historyData.length > 0) {
      userMsgData.history_data = historyData;
    }

    // Store persona prompts in persona_data if provided
    if (personaPrompts && personaPrompts.length > 0) {
      userMsgData.persona_data = personaPrompts;
    }

    const { error: userMsgError } = await supabase.from('chat_messages').insert(userMsgData);

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

    // Record usage to ai_token_usage for statistics (external agents are free, cost = 0)
    await supabase.from('ai_token_usage').insert({
      user_id: userId,
      model_id: modelId,
      input_tokens: inputTokens || 0,
      output_tokens: outputTokens || 0,
      cost_usd: 0, // External agents are free
      conversation_id: activeConversationId,
      message_type: 'chat',
    });

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

