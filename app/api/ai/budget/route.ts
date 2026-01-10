import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Plan budget constants (must match ai-tokens.config.ts TOKEN_QUOTAS.aiCostBudget)
const PLAN_BUDGETS = {
  free: 0,
  pro: 5.00,
  plus: 5.00,
};

const DEFAULT_MONTHLY_BUDGET = 5.00;

// AI Models (server-side copy for budget calculations)
const AI_MODELS = [
  { id: 'mistral/ministral-3b', name: 'Ministral 3B', icon: '🔮', provider: 'Mistral', inputCostPer1M: 0.04, outputCostPer1M: 0.04 },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', icon: '🦙', provider: 'Meta', inputCostPer1M: 0, outputCostPer1M: 0 },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', icon: '💎', provider: 'Google', inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', icon: '🎭', provider: 'Anthropic', inputCostPer1M: 0.80, outputCostPer1M: 4.00 },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', icon: '🤖', provider: 'OpenAI', inputCostPer1M: 0.15, outputCostPer1M: 0.60 },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', icon: '🌊', provider: 'DeepSeek', inputCostPer1M: 0.14, outputCostPer1M: 0.28 },
];

// Get plan-based budget for user
function getPlanBudget(isPlus: boolean, isPro: boolean): number {
  if (isPlus) return PLAN_BUDGETS.plus;
  if (isPro) return PLAN_BUDGETS.pro;
  return 0;
}

// Calculate safe tokens for a budget
function calculateSafeTokensForBudget(modelId: string, budgetUsd: number): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) return 0;
  const avgCostPer1M = (model.inputCostPer1M + 2 * model.outputCostPer1M) / 3;
  if (avgCostPer1M === 0) return 100_000_000; // Free model
  const tokensPerDollar = 1_000_000 / avgCostPer1M;
  return Math.floor(budgetUsd * tokensPerDollar);
}

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get user's budget settings and usage
export async function GET() {
  try {
    const { userId, has } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine user's plan
    const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
    const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;
    const planBudget = getPlanBudget(isPlus, isPro);

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
        },
        models: defaultModels,
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

