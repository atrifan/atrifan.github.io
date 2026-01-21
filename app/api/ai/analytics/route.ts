import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/src/config/ai-tokens.config';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface AnalyticsQuery {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  modelId?: string;
  groupBy?: 'day' | 'week' | 'month' | 'model';
}

interface ModelInfo {
  id: string;
  name: string;
  icon: string;
  iconUrl?: string;
  agentUrl?: string;
  isAgent?: boolean;
}

/**
 * GET /api/ai/analytics
 * Query params:
 * - startDate: YYYY-MM-DD (default: 30 days ago)
 * - endDate: YYYY-MM-DD (default: today)
 * - modelId: filter by specific model
 * - groupBy: 'day' | 'week' | 'month' | 'model' (default: 'day')
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();
    const modelId = searchParams.get('modelId');
    const groupBy = (searchParams.get('groupBy') || 'day') as AnalyticsQuery['groupBy'];

    // Fetch aggregated analytics from the summary table
    let query = supabase
      .from('user_ai_analytics')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (modelId) {
      query = query.eq('model_id', modelId);
    }

    const { data: rawData, error } = await query;

    if (error) {
      console.error('Failed to fetch analytics:', error);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    // Calculate summary stats
    const summary = calculateSummary(rawData || []);

    // Get unique model IDs to look up agent info
    const uniqueModelIds = [...new Set((rawData || []).map(r => r.model_id))];

    // Look up agent info for any agent: prefixed model IDs
    const modelInfoMap = await getModelInfoMap(supabase, userId, uniqueModelIds);

    // Process and aggregate data based on groupBy
    const aggregated = aggregateData(rawData || [], groupBy || 'day', modelInfoMap);

    // Get model breakdown with enriched info
    const modelBreakdown = getModelBreakdown(rawData || [], modelInfoMap);

    // Get context usage breakdown
    const contextBreakdown = getContextBreakdown(rawData || []);

    // Get daily trend (last 30 days)
    const dailyTrend = getDailyTrend(rawData || []);

    return NextResponse.json({
      summary,
      modelBreakdown,
      contextBreakdown,
      dailyTrend,
      aggregated,
      modelInfoMap, // Include for frontend use
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().split('T')[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0];
}

interface AnalyticsRow {
  date: string;
  model_id: string;
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_rag_tokens: number;
  total_history_tokens: number;
  total_recent_history_tokens: number;
  total_persona_tokens: number;
  total_cost: number;
  rag_usage_count: number;
  history_usage_count: number;
  persona_usage_count: number;
}

// Look up model info for all model IDs, including external agents
async function getModelInfoMap(
  supabase: SupabaseClient,
  userId: string,
  modelIds: string[]
): Promise<Record<string, ModelInfo>> {
  const infoMap: Record<string, ModelInfo> = {};

  // First, populate with known AI models
  for (const model of AI_MODELS) {
    infoMap[model.id] = {
      id: model.id,
      name: model.name,
      icon: model.icon,
      isAgent: false,
    };
  }

  // Find agent: prefixed model IDs
  const agentIds = modelIds
    .filter(id => id.startsWith('agent:'))
    .map(id => id.replace('agent:', ''));

  if (agentIds.length > 0) {
    // Look up chat_connectors for these agent IDs, including the linked a2a_agent and external_url
    const { data: connectors } = await supabase
      .from('chat_connectors')
      .select('id, display_name, icon, icon_url, a2a_agent_id, external_url')
      .eq('user_id', userId)
      .in('id', agentIds);

    // Collect a2a_agent_ids to look up for icon_url and agent_url fallback
    const a2aAgentIds: string[] = [];
    if (connectors) {
      for (const connector of connectors) {
        if (connector.a2a_agent_id) {
          a2aAgentIds.push(connector.a2a_agent_id);
        }
      }
    }

    // Look up a2a_agents for icon_url and agent_url fallback
    let a2aAgentMap: Record<string, { icon_url: string | null; agent_url: string | null }> = {};
    if (a2aAgentIds.length > 0) {
      const { data: a2aAgents } = await supabase
        .from('a2a_agents')
        .select('id, icon_url, agent_url')
        .in('id', a2aAgentIds);

      if (a2aAgents) {
        for (const agent of a2aAgents) {
          a2aAgentMap[agent.id] = { icon_url: agent.icon_url, agent_url: agent.agent_url };
        }
      }
    }

    if (connectors) {
      for (const connector of connectors) {
        // Try connector's icon_url first, then fall back to a2a_agent's icon_url
        const iconUrl = connector.icon_url ||
          (connector.a2a_agent_id ? a2aAgentMap[connector.a2a_agent_id]?.icon_url : null);
        // Get agent URL from connector's external_url or a2a_agent's agent_url
        const agentUrl = connector.external_url ||
          (connector.a2a_agent_id ? a2aAgentMap[connector.a2a_agent_id]?.agent_url : null);

        infoMap[`agent:${connector.id}`] = {
          id: `agent:${connector.id}`,
          name: connector.display_name || 'External Agent',
          icon: connector.icon || '🤖',
          iconUrl: iconUrl || undefined,
          agentUrl: agentUrl || undefined,
          isAgent: true,
        };
      }
    }

    // Also try a2a_agents table directly for any not found in connectors
    // (in case model_id was stored as agent:a2a_agent_id instead of agent:connector_id)
    const { data: agents } = await supabase
      .from('a2a_agents')
      .select('id, display_name, icon_url, agent_url')
      .eq('user_id', userId)
      .in('id', agentIds);

    if (agents) {
      for (const agent of agents) {
        if (!infoMap[`agent:${agent.id}`]) {
          infoMap[`agent:${agent.id}`] = {
            id: `agent:${agent.id}`,
            name: agent.display_name || 'External Agent',
            icon: '🤖',
            iconUrl: agent.icon_url || undefined,
            agentUrl: agent.agent_url || undefined,
            isAgent: true,
          };
        }
      }
    }
  }

  // Handle unknown model IDs
  for (const modelId of modelIds) {
    if (!infoMap[modelId]) {
      infoMap[modelId] = {
        id: modelId,
        name: modelId.startsWith('agent:') ? 'Unknown Agent' : modelId,
        icon: modelId.startsWith('agent:') ? '🤖' : '🔮',
        isAgent: modelId.startsWith('agent:'),
      };
    }
  }

  return infoMap;
}

function calculateSummary(data: AnalyticsRow[]) {
  return {
    totalMessages: data.reduce((sum, r) => sum + r.message_count, 0),
    totalInputTokens: data.reduce((sum, r) => sum + r.total_input_tokens, 0),
    totalOutputTokens: data.reduce((sum, r) => sum + r.total_output_tokens, 0),
    totalTokens: data.reduce((sum, r) => sum + r.total_input_tokens + r.total_output_tokens, 0),
    totalCost: data.reduce((sum, r) => sum + Number(r.total_cost), 0),
    totalRagTokens: data.reduce((sum, r) => sum + r.total_rag_tokens, 0),
    totalHistoryTokens: data.reduce((sum, r) => sum + r.total_history_tokens, 0),
    totalRecentHistoryTokens: data.reduce((sum, r) => sum + r.total_recent_history_tokens, 0),
    totalPersonaTokens: data.reduce((sum, r) => sum + r.total_persona_tokens, 0),
    ragUsageCount: data.reduce((sum, r) => sum + r.rag_usage_count, 0),
    historyUsageCount: data.reduce((sum, r) => sum + r.history_usage_count, 0),
    personaUsageCount: data.reduce((sum, r) => sum + r.persona_usage_count, 0),
    uniqueModels: [...new Set(data.map(r => r.model_id))].length,
    uniqueDays: [...new Set(data.map(r => r.date))].length,
  };
}

function getModelBreakdown(data: AnalyticsRow[], modelInfoMap: Record<string, ModelInfo>) {
  const byModel: Record<string, { messages: number; tokens: number; cost: number }> = {};

  for (const row of data) {
    if (!byModel[row.model_id]) {
      byModel[row.model_id] = { messages: 0, tokens: 0, cost: 0 };
    }
    byModel[row.model_id].messages += row.message_count;
    byModel[row.model_id].tokens += row.total_input_tokens + row.total_output_tokens;
    byModel[row.model_id].cost += Number(row.total_cost);
  }

  return Object.entries(byModel)
    .map(([modelId, stats]) => {
      const info = modelInfoMap[modelId] || { name: modelId, icon: '🔮' };
      return {
        modelId,
        modelName: info.name,
        modelIcon: info.icon,
        modelIconUrl: info.iconUrl,
        modelAgentUrl: info.agentUrl,
        isAgent: info.isAgent || false,
        ...stats
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

function getContextBreakdown(data: AnalyticsRow[]) {
  const totalTokens = data.reduce((sum, r) => sum + r.total_input_tokens + r.total_output_tokens, 0);
  const ragTokens = data.reduce((sum, r) => sum + r.total_rag_tokens, 0);
  const historyTokens = data.reduce((sum, r) => sum + r.total_history_tokens, 0);
  const recentHistoryTokens = data.reduce((sum, r) => sum + r.total_recent_history_tokens, 0);
  const personaTokens = data.reduce((sum, r) => sum + r.total_persona_tokens, 0);
  const contextTokens = ragTokens + historyTokens + recentHistoryTokens + personaTokens;
  const queryTokens = totalTokens - contextTokens;

  return {
    rag: { tokens: ragTokens, percent: totalTokens > 0 ? (ragTokens / totalTokens) * 100 : 0 },
    history: { tokens: historyTokens, percent: totalTokens > 0 ? (historyTokens / totalTokens) * 100 : 0 },
    recentHistory: { tokens: recentHistoryTokens, percent: totalTokens > 0 ? (recentHistoryTokens / totalTokens) * 100 : 0 },
    persona: { tokens: personaTokens, percent: totalTokens > 0 ? (personaTokens / totalTokens) * 100 : 0 },
    query: { tokens: queryTokens, percent: totalTokens > 0 ? (queryTokens / totalTokens) * 100 : 0 },
    total: totalTokens,
  };
}

function getDailyTrend(data: AnalyticsRow[]) {
  const byDay: Record<string, { messages: number; tokens: number; cost: number }> = {};

  for (const row of data) {
    if (!byDay[row.date]) {
      byDay[row.date] = { messages: 0, tokens: 0, cost: 0 };
    }
    byDay[row.date].messages += row.message_count;
    byDay[row.date].tokens += row.total_input_tokens + row.total_output_tokens;
    byDay[row.date].cost += Number(row.total_cost);
  }

  return Object.entries(byDay)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateData(data: AnalyticsRow[], groupBy: string, modelInfoMap?: Record<string, ModelInfo>) {
  if (groupBy === 'model') {
    return getModelBreakdown(data, modelInfoMap || {});
  }

  if (groupBy === 'day') {
    return getDailyTrend(data);
  }

  if (groupBy === 'week') {
    const byWeek: Record<string, { messages: number; tokens: number; cost: number }> = {};
    for (const row of data) {
      const date = new Date(row.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!byWeek[weekKey]) {
        byWeek[weekKey] = { messages: 0, tokens: 0, cost: 0 };
      }
      byWeek[weekKey].messages += row.message_count;
      byWeek[weekKey].tokens += row.total_input_tokens + row.total_output_tokens;
      byWeek[weekKey].cost += Number(row.total_cost);
    }
    return Object.entries(byWeek)
      .map(([week, stats]) => ({ week, ...stats }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  if (groupBy === 'month') {
    const byMonth: Record<string, { messages: number; tokens: number; cost: number }> = {};
    for (const row of data) {
      const monthKey = row.date.substring(0, 7); // YYYY-MM

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { messages: 0, tokens: 0, cost: 0 };
      }
      byMonth[monthKey].messages += row.message_count;
      byMonth[monthKey].tokens += row.total_input_tokens + row.total_output_tokens;
      byMonth[monthKey].cost += Number(row.total_cost);
    }
    return Object.entries(byMonth)
      .map(([month, stats]) => ({ month, ...stats }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  return data;
}

