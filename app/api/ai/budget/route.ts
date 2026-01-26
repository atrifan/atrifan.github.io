import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AI_MODELS,
  EMBEDDING_MODELS,
  TOKEN_QUOTAS,
  DEFAULT_MONTHLY_BUDGET,
  calculateSafeTokensForBudget,
} from '@/src/config/ai-tokens.config';

export const dynamic = 'force-dynamic';

// Get plan-based budget for user (uses TOKEN_QUOTAS from config)
function getPlanBudget(isPlus: boolean, isPro: boolean): number {
  if (isPlus) return TOKEN_QUOTAS.plus.aiCostBudget;
  if (isPro) return TOKEN_QUOTAS.pro.aiCostBudget;
  return TOKEN_QUOTAS.free.aiCostBudget;
}

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get user's budget settings and usage
// Query params: ?year=2025&month=1 for historical data (Pro+ only)
export async function GET(request: NextRequest) {
  try {
    const { userId, has } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine user's plan
    const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
    const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;
    const planBudget = getPlanBudget(isPlus, isPro);

    // Parse optional year/month query params for historical data
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    // Determine if this is a historical query
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    let queryYear = currentYear;
    let queryMonth = currentMonth;
    let isHistorical = false;

    if (yearParam && monthParam) {
      // Historical queries require Pro+ tier
      if (!isPro) {
        return NextResponse.json({ error: 'Historical budget data requires Pro or Plus subscription' }, { status: 403 });
      }

      queryYear = parseInt(yearParam, 10);
      queryMonth = parseInt(monthParam, 10);

      // Validate year/month
      if (isNaN(queryYear) || isNaN(queryMonth) || queryMonth < 1 || queryMonth > 12) {
        return NextResponse.json({ error: 'Invalid year or month parameter' }, { status: 400 });
      }

      // Check if it's a historical query (not current month)
      isHistorical = queryYear !== currentYear || queryMonth !== currentMonth;
    }

    const supabase = getSupabaseClient();

    // If no database, return default/empty data (graceful degradation)
    if (!supabase) {
      const totalBudget = planBudget || DEFAULT_MONTHLY_BUDGET;
      const defaultModels = AI_MODELS.map(model => ({
        modelId: model.id,
        modelName: model.name,
        icon: model.icon,
        provider: model.provider,
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M,
        safeTokensForBudget: calculateSafeTokensForBudget(model.id, totalBudget),
        usedTokens: 0,
        usedCost: 0,
        requestCount: 0,
        usagePercent: 0,
        remainingTokens: calculateSafeTokensForBudget(model.id, totalBudget),
      }));

      const defaultEmbeddingModels = EMBEDDING_MODELS.map(model => ({
        modelId: model.id,
        modelName: model.name,
        icon: model.icon,
        provider: model.provider,
        costPer1M: model.costPer1M,
        dimensions: model.dimensions,
        isLocal: model.isLocal,
        usedTokens: 0,
        usedCost: 0,
        requestCount: 0,
        usagePercent: 0,
      }));

      return NextResponse.json({
        budget: {
          planBudgetUsd: planBudget,
          extraBudgetUsd: 0,
          monthlyBudgetUsd: totalBudget,
          hardLimit: true,
          alertThreshold50: true,
          alertThreshold80: true,
          alertThreshold100: true,
        },
        usage: {
          totalCost: 0,
          totalTokens: 0,
          budgetUsedPercent: 0,
          remainingBudget: totalBudget,
          byModel: {},
          embeddingCost: 0,
          embeddingTokens: 0,
        },
        models: defaultModels,
        embeddingModels: defaultEmbeddingModels,
        _note: 'Database not configured - showing defaults',
      });
    }

    // Get or create budget settings (for extra budget only now)
    let settings: { extra_budget_usd?: number; hard_limit?: boolean; alert_threshold_50?: boolean; alert_threshold_80?: boolean; alert_threshold_100?: boolean } | null = null;
    try {
      const { data } = await supabase
        .from('user_budget_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      settings = data;
    } catch {
      // Table might not exist yet
    }

    // Extra budget is user-added on top of plan budget
    const extraBudget = settings?.extra_budget_usd || 0;
    const monthlyBudget = planBudget + extraBudget;

    // Calculate date range for the query (either current month or historical)
    const startOfMonth = new Date(queryYear, queryMonth - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(queryYear, queryMonth, 0, 23, 59, 59, 999); // Last day of month

    // Aggregate usage per model
    const usageByModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; count: number }> = {};
    let totalCost = 0;
    let totalTokens = 0;

    try {
      const { data: usage } = await supabase
        .from('ai_token_usage')
        .select('model_id, input_tokens, output_tokens, cost_usd')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString());

      (usage || []).forEach((u: { model_id: string; input_tokens: number; output_tokens: number; cost_usd: number }) => {
        if (!usageByModel[u.model_id]) {
          usageByModel[u.model_id] = { inputTokens: 0, outputTokens: 0, cost: 0, count: 0 };
        }
        usageByModel[u.model_id].inputTokens += u.input_tokens || 0;
        usageByModel[u.model_id].outputTokens += u.output_tokens || 0;
        usageByModel[u.model_id].cost += parseFloat(String(u.cost_usd)) || 0;
        usageByModel[u.model_id].count += 1;
        totalCost += parseFloat(String(u.cost_usd)) || 0;
        totalTokens += (u.input_tokens || 0) + (u.output_tokens || 0);
      });
    } catch {
      // Table might not exist yet - continue with empty usage
    }

    // Build chat model info with usage
    // Calculate total input/output tokens for summary
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    Object.values(usageByModel).forEach(u => {
      totalInputTokens += u.inputTokens;
      totalOutputTokens += u.outputTokens;
    });

    const modelsWithUsage = AI_MODELS.map(model => {
      const modelUsage = usageByModel[model.id] || { inputTokens: 0, outputTokens: 0, cost: 0, count: 0 };
      const safeTokens = calculateSafeTokensForBudget(model.id, monthlyBudget);
      const usedTokens = modelUsage.inputTokens + modelUsage.outputTokens;

      return {
        modelId: model.id,
        modelName: model.name,
        icon: model.icon,
        provider: model.provider,
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M,
        safeTokensForBudget: safeTokens,
        usedTokens,
        inputTokens: modelUsage.inputTokens,
        outputTokens: modelUsage.outputTokens,
        usedCost: modelUsage.cost,
        requestCount: modelUsage.count,
        usagePercent: safeTokens > 0 ? Math.min(100, (usedTokens / safeTokens) * 100) : 0,
        remainingTokens: Math.max(0, safeTokens - usedTokens),
      };
    });

    // Build embedding model info with usage
    // Embedding usage is tracked in the same ai_token_usage table with embedding model IDs
    let embeddingTotalCost = 0;
    let embeddingTotalTokens = 0;
    const embeddingModelsWithUsage = EMBEDDING_MODELS.map(model => {
      const modelUsage = usageByModel[model.id] || { inputTokens: 0, outputTokens: 0, cost: 0, count: 0 };
      const usedTokens = modelUsage.inputTokens; // Embeddings only have input tokens
      const usedCost = modelUsage.cost;
      embeddingTotalCost += usedCost;
      embeddingTotalTokens += usedTokens;

      // Calculate safe tokens for embedding budget (embeddings share the same budget)
      const safeTokens = model.costPer1M > 0
        ? Math.floor((monthlyBudget / model.costPer1M) * 1_000_000)
        : 100_000_000; // Local model = unlimited

      return {
        modelId: model.id,
        modelName: model.name,
        icon: model.icon,
        provider: model.provider,
        costPer1M: model.costPer1M,
        dimensions: model.dimensions,
        isLocal: model.isLocal,
        usedTokens,
        usedCost,
        requestCount: modelUsage.count,
        usagePercent: safeTokens > 0 ? Math.min(100, (usedTokens / safeTokens) * 100) : 0,
      };
    });

    return NextResponse.json({
      // Period information for the query
      period: {
        year: queryYear,
        month: queryMonth,
        isHistorical,
        startDate: startOfMonth.toISOString(),
        endDate: endOfMonth.toISOString(),
      },
      budget: {
        planBudgetUsd: planBudget,
        extraBudgetUsd: extraBudget,
        monthlyBudgetUsd: monthlyBudget,
        hardLimit: settings?.hard_limit ?? true,
        alertThreshold50: settings?.alert_threshold_50 ?? true,
        alertThreshold80: settings?.alert_threshold_80 ?? true,
        alertThreshold100: settings?.alert_threshold_100 ?? true,
      },
      usage: {
        totalCost,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        budgetUsedPercent: monthlyBudget > 0 ? Math.min(100, (totalCost / monthlyBudget) * 100) : 0,
        remainingBudget: isHistorical ? 0 : Math.max(0, monthlyBudget - totalCost), // No remaining for historical
        byModel: usageByModel,
        // Embedding-specific usage
        embeddingCost: embeddingTotalCost,
        embeddingTokens: embeddingTotalTokens,
      },
      models: modelsWithUsage,
      embeddingModels: embeddingModelsWithUsage,
    });
  } catch (error) {
    console.error('Error in budget GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update user's extra budget (plan budget is fixed)
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { extraBudgetUsd, hardLimit, alertThreshold50, alertThreshold80, alertThreshold100 } = body;

    // Validate extra budget (0-100 range for extra)
    if (extraBudgetUsd !== undefined && (extraBudgetUsd < 0 || extraBudgetUsd > 100)) {
      return NextResponse.json({ error: 'Extra budget must be between $0 and $100' }, { status: 400 });
    }

    // Get current settings to add to extra budget
    let currentExtra = 0;
    try {
      const { data: current } = await supabase
        .from('user_budget_settings')
        .select('extra_budget_usd')
        .eq('user_id', userId)
        .single();
      currentExtra = current?.extra_budget_usd || 0;
    } catch {
      // No existing settings
    }

    // Add to existing extra budget (accumulative)
    const newExtraBudget = currentExtra + (extraBudgetUsd || 0);

    // Upsert settings
    const { data, error } = await supabase
      .from('user_budget_settings')
      .upsert({
        user_id: userId,
        extra_budget_usd: newExtraBudget,
        hard_limit: hardLimit ?? true,
        alert_threshold_50: alertThreshold50 ?? true,
        alert_threshold_80: alertThreshold80 ?? true,
        alert_threshold_100: alertThreshold100 ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Error updating budget:', error);
      return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: data, newExtraBudget });
  } catch (error) {
    console.error('Error in budget PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

