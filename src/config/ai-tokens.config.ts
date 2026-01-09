'use client';

// AI Token Configuration for Subscription Tiers

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  icon: string;
  tier: 'free' | 'pro' | 'plus';
  inputCostPer1M: number;  // $ per 1M tokens
  outputCostPer1M: number; // $ per 1M tokens
  contextWindow: number;
  description: string;
  capabilities: string[];
}

// Models available on Vercel AI Gateway - sorted by cost
export const AI_MODELS: AIModel[] = [
  // PRO tier - Single cheapest model
  {
    id: 'mistral/ministral-3b',
    name: 'Ministral 3B',
    provider: 'Mistral',
    icon: '⚡',
    tier: 'pro',
    inputCostPer1M: 0.04,
    outputCostPer1M: 0.04,
    contextWindow: 128000,
    description: 'Ultra-fast and cost-effective for everyday tasks',
    capabilities: ['chat', 'reasoning'],
  },
  
  // PLUS tier - All quality models
  {
    id: 'meta/llama-3.2-1b',
    name: 'Llama 3.2 1B',
    provider: 'Meta',
    icon: '🦙',
    tier: 'plus',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.10,
    contextWindow: 128000,
    description: 'Compact and efficient for quick responses',
    capabilities: ['chat'],
  },
  {
    id: 'google/gemini-2.0-flash-lite',
    name: 'Gemini Flash Lite',
    provider: 'Google',
    icon: '✨',
    tier: 'plus',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    contextWindow: 1049000,
    description: 'Massive 1M context window, great for long documents',
    capabilities: ['chat', 'vision', 'long-context'],
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    icon: '🤖',
    tier: 'plus',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: 128000,
    description: 'OpenAI quality at mini prices',
    capabilities: ['chat', 'vision', 'tool-use'],
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    icon: '🎵',
    tier: 'plus',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    contextWindow: 200000,
    description: 'Fast Claude with excellent reasoning',
    capabilities: ['chat', 'reasoning', 'tool-use'],
  },
  {
    id: 'deepseek/deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    icon: '🔍',
    tier: 'plus',
    inputCostPer1M: 0.27,
    outputCostPer1M: 1.10,
    contextWindow: 164000,
    description: 'Powerful reasoning at great value',
    capabilities: ['chat', 'reasoning', 'coding'],
  },
];

// Embedding model for MCP tools, search, filters (Pro tier)
export const EMBEDDING_MODEL = {
  id: 'openai/text-embedding-3-small',
  name: 'Text Embedding 3 Small',
  provider: 'OpenAI',
  costPer1M: 0.02, // Very cheap
};

// Token quotas per tier
export interface TokenQuota {
  tier: 'free' | 'pro' | 'plus';
  monthlyTokens: number;
  models: string[]; // model IDs allowed
  features: string[];
  price: number;
  aiCostBudget: number; // 20% of price for 80% margin
}

export const TOKEN_QUOTAS: Record<string, TokenQuota> = {
  free: {
    tier: 'free',
    monthlyTokens: 0, // No AI for free
    models: [],
    features: ['basic-tools', 'ads'],
    price: 0,
    aiCostBudget: 0,
  },
  pro: {
    tier: 'pro',
    monthlyTokens: 15_000_000, // 15M tokens
    models: ['mistral/ministral-3b'],
    features: ['ai-chat', 'mcp-server', 'embeddings', 'ads'],
    price: 7,
    aiCostBudget: 1.40, // $7 * 20% = $1.40
  },
  plus: {
    tier: 'plus',
    monthlyTokens: 8_000_000, // 8M tokens (quality over quantity)
    models: AI_MODELS.map(m => m.id), // All models
    features: ['ai-chat', 'mcp-server', 'embeddings', 'agents', 'priority-support', 'ads'],
    price: 14,
    aiCostBudget: 2.80, // $14 * 20% = $2.80
  },
};

// Calculate estimated messages per month
export function estimateMessagesPerMonth(tier: 'free' | 'pro' | 'plus'): number {
  const quota = TOKEN_QUOTAS[tier];
  if (!quota || quota.monthlyTokens === 0) return 0;
  
  // Average message: 500 input + 1000 output = 1500 tokens
  const avgTokensPerMessage = 1500;
  return Math.floor(quota.monthlyTokens / avgTokensPerMessage);
}

// Calculate cost for a message
export function calculateTokenCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) return 0;
  
  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
  
  return inputCost + outputCost;
}

// Get usage percentage
export function getUsagePercentage(usedTokens: number, tier: 'free' | 'pro' | 'plus'): number {
  const quota = TOKEN_QUOTAS[tier];
  if (!quota || quota.monthlyTokens === 0) return 100;
  return Math.min(100, (usedTokens / quota.monthlyTokens) * 100);
}

// Check if user can send message
export function canSendMessage(usedTokens: number, tier: 'free' | 'pro' | 'plus'): boolean {
  const quota = TOKEN_QUOTAS[tier];
  if (!quota) return false;
  if (tier === 'free') return false;
  return usedTokens < quota.monthlyTokens;
}

// Get remaining tokens
export function getRemainingTokens(usedTokens: number, tier: 'free' | 'pro' | 'plus'): number {
  const quota = TOKEN_QUOTAS[tier];
  if (!quota) return 0;
  return Math.max(0, quota.monthlyTokens - usedTokens);
}

// Format token count for display
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return tokens.toString();
}

// ============ BUDGET-BASED CALCULATIONS ============

// Default monthly budget in USD
export const DEFAULT_MONTHLY_BUDGET = 5.00;

// Calculate average cost per token for a model (weighted input/output)
export function getAverageCostPerToken(modelId: string): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) return 0;
  // Assume 1:2 ratio of input:output tokens on average
  const avgCost = (model.inputCostPer1M + 2 * model.outputCostPer1M) / 3;
  return avgCost / 1_000_000;
}

// Calculate "safe tokens" for a budget (tokens you can use without exceeding budget)
export function calculateSafeTokensForBudget(modelId: string, budgetUsd: number): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) return 0;

  // Use weighted average (1:2 input:output ratio)
  const avgCostPer1M = (model.inputCostPer1M + 2 * model.outputCostPer1M) / 3;
  const tokensPerDollar = 1_000_000 / avgCostPer1M;

  return Math.floor(budgetUsd * tokensPerDollar);
}

// Calculate budget usage percentage based on cost spent
export function getBudgetUsagePercent(costSpent: number, budgetUsd: number): number {
  if (budgetUsd <= 0) return 100;
  return Math.min(100, (costSpent / budgetUsd) * 100);
}

// Calculate remaining budget
export function getRemainingBudget(costSpent: number, budgetUsd: number): number {
  return Math.max(0, budgetUsd - costSpent);
}

// Check if user can send message based on budget
export function canSendMessageWithBudget(costSpent: number, budgetUsd: number, hardLimit: boolean): boolean {
  if (hardLimit) {
    return costSpent < budgetUsd;
  }
  // Soft limit: allow up to 120% of budget
  return costSpent < budgetUsd * 1.2;
}

// Get model cost breakdown for display
export interface ModelCostInfo {
  modelId: string;
  modelName: string;
  icon: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  safeTokensForBudget: number;
  estimatedMessages: number;
}

export function getModelCostInfo(modelId: string, budgetUsd: number): ModelCostInfo | null {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) return null;

  const safeTokens = calculateSafeTokensForBudget(modelId, budgetUsd);
  // Average message: 500 input + 1000 output = 1500 tokens
  const estimatedMessages = Math.floor(safeTokens / 1500);

  return {
    modelId: model.id,
    modelName: model.name,
    icon: model.icon,
    inputCostPer1M: model.inputCostPer1M,
    outputCostPer1M: model.outputCostPer1M,
    safeTokensForBudget: safeTokens,
    estimatedMessages,
  };
}

// Get all models with their budget info
export function getAllModelsBudgetInfo(budgetUsd: number): ModelCostInfo[] {
  return AI_MODELS.map(model => getModelCostInfo(model.id, budgetUsd)!).filter(Boolean);
}

// Format currency for display
export function formatCurrency(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  if (amount < 1) {
    return `$${amount.toFixed(3)}`;
  }
  return `$${amount.toFixed(2)}`;
}

// Calculate equivalent tokens across models for same cost
export function getEquivalentTokens(
  sourceModelId: string,
  sourceTokens: number,
  targetModelId: string
): number {
  const sourceModel = AI_MODELS.find(m => m.id === sourceModelId);
  const targetModel = AI_MODELS.find(m => m.id === targetModelId);
  if (!sourceModel || !targetModel) return 0;

  // Calculate cost of source tokens
  const avgSourceCost = (sourceModel.inputCostPer1M + 2 * sourceModel.outputCostPer1M) / 3;
  const cost = (sourceTokens / 1_000_000) * avgSourceCost;

  // Calculate equivalent tokens in target model
  const avgTargetCost = (targetModel.inputCostPer1M + 2 * targetModel.outputCostPer1M) / 3;
  return Math.floor((cost / avgTargetCost) * 1_000_000);
}

// Throttle configuration (requests per minute)
export const THROTTLE_CONFIG = {
  free: { requestsPerMinute: 0, requestsPerHour: 0 },
  pro: { requestsPerMinute: 10, requestsPerHour: 100 },
  plus: { requestsPerMinute: 30, requestsPerHour: 500 },
};

