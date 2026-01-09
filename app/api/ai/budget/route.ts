import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS, calculateSafeTokensForBudget, DEFAULT_MONTHLY_BUDGET } from '@/src/config/ai-tokens.config';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get user's budget settings and usage
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    // If no database, return default/empty data (graceful degradation)
    if (!supabase) {
      const defaultModels = AI_MODELS.map(model => ({
        modelId: model.id,
        modelName: model.name,
        icon: model.icon,
        provider: model.provider,
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M,
        safeTokensForBudget: calculateSafeTokensForBudget(model.id, DEFAULT_MONTHLY_BUDGET),
        usedTokens: 0,
        usedCost: 0,
        requestCount: 0,
        usagePercent: 0,
        remainingTokens: calculateSafeTokensForBudget(model.id, DEFAULT_MONTHLY_BUDGET),
      }));

      return NextResponse.json({
        budget: {
          monthlyBudgetUsd: DEFAULT_MONTHLY_BUDGET,
          hardLimit: true,
          alertThreshold50: true,
          alertThreshold80: true,
          alertThreshold100: true,
        },
        usage: {
          totalCost: 0,
          totalTokens: 0,
          budgetUsedPercent: 0,
          remainingBudget: DEFAULT_MONTHLY_BUDGET,
          byModel: {},
        },
        models: defaultModels,
        _note: 'Database not configured - showing defaults',
      });
    }

    // Get or create budget settings
    let settings = null;
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

    if (!settings) {
      // Try to create default settings
      try {
        const { data: newSettings } = await supabase
          .from('user_budget_settings')
          .insert({ user_id: userId, monthly_budget_usd: DEFAULT_MONTHLY_BUDGET })
          .select()
          .single();
        settings = newSettings;
      } catch {
        // Table might not exist - use defaults
      }
    }

    const monthlyBudget = settings?.monthly_budget_usd || DEFAULT_MONTHLY_BUDGET;

    // Get current month usage per model
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Aggregate usage per model
    const usageByModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; count: number }> = {};
    let totalCost = 0;
    let totalTokens = 0;

    try {
      const { data: usage } = await supabase
        .from('ai_token_usage')
        .select('model_id, input_tokens, output_tokens, cost_usd')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString());

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

    // Build model info with usage
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
        usedCost: modelUsage.cost,
        requestCount: modelUsage.count,
        usagePercent: safeTokens > 0 ? Math.min(100, (usedTokens / safeTokens) * 100) : 0,
        remainingTokens: Math.max(0, safeTokens - usedTokens),
      };
    });

    return NextResponse.json({
      budget: {
        monthlyBudgetUsd: monthlyBudget,
        hardLimit: settings?.hard_limit ?? true,
        alertThreshold50: settings?.alert_threshold_50 ?? true,
        alertThreshold80: settings?.alert_threshold_80 ?? true,
        alertThreshold100: settings?.alert_threshold_100 ?? true,
      },
      usage: {
        totalCost,
        totalTokens,
        budgetUsedPercent: monthlyBudget > 0 ? Math.min(100, (totalCost / monthlyBudget) * 100) : 0,
        remainingBudget: Math.max(0, monthlyBudget - totalCost),
        byModel: usageByModel,
      },
      models: modelsWithUsage,
    });
  } catch (error) {
    console.error('Error in budget GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update user's budget settings
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
    const { monthlyBudgetUsd, hardLimit, alertThreshold50, alertThreshold80, alertThreshold100 } = body;

    // Validate budget
    if (monthlyBudgetUsd !== undefined && (monthlyBudgetUsd < 0 || monthlyBudgetUsd > 1000)) {
      return NextResponse.json({ error: 'Budget must be between $0 and $1000' }, { status: 400 });
    }

    // Upsert settings
    const { data, error } = await supabase
      .from('user_budget_settings')
      .upsert({
        user_id: userId,
        monthly_budget_usd: monthlyBudgetUsd ?? DEFAULT_MONTHLY_BUDGET,
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

    return NextResponse.json({ success: true, settings: data });
  } catch (error) {
    console.error('Error in budget PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

