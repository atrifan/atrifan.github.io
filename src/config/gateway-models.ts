/**
 * The built-in model list: the stand-in when Vercel AI Gateway's listing
 * (https://ai-gateway.vercel.sh/v1/models) can't be fetched and nothing is cached. Normally the gateway
 * is a pass-through: /api/models and /api/chat offer every Vercel chat model at Vercel's price × the
 * markup (src/lib/models/catalog.ts). Prices here are USD per 1M tokens at Vercel's list price, before
 * markup; models with long-context tiers are listed at their base tier.
 *
 * Refresh: compare with Vercel's listing and update tests/fixtures/vercel-models-snapshot.json;
 * tests/unit/model-catalog.vitest.ts fails when an id is missing from the snapshot or its price differs.
 */
export interface GatewayModel {
  id: string;
  name: string;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

export const DEFAULT_CHAT_MODEL = 'openai/gpt-4o-mini';

export const GATEWAY_MODELS: readonly GatewayModel[] = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075 },
  { id: 'openai/gpt-4o', name: 'GPT-4o', inputPer1M: 2.5, outputPer1M: 10, cachedInputPer1M: 1.25 },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 mini', inputPer1M: 0.4, outputPer1M: 1.6, cachedInputPer1M: 0.1 },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 nano', inputPer1M: 0.1, outputPer1M: 0.4, cachedInputPer1M: 0.025 },
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', inputPer1M: 5, outputPer1M: 30, cachedInputPer1M: 0.5 },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', inputPer1M: 3, outputPer1M: 15, cachedInputPer1M: 0.3 },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', inputPer1M: 3, outputPer1M: 15, cachedInputPer1M: 0.3 },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', inputPer1M: 1, outputPer1M: 5, cachedInputPer1M: 0.1 },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', inputPer1M: 0.3, outputPer1M: 2.5, cachedInputPer1M: 0.03 },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)', inputPer1M: 2, outputPer1M: 12, cachedInputPer1M: 0.2 },
  { id: 'mistral/ministral-3b', name: 'Ministral 3B', inputPer1M: 0.1, outputPer1M: 0.1, cachedInputPer1M: 0.01 },
  { id: 'mistral/mistral-large-3', name: 'Mistral Large 3', inputPer1M: 0.5, outputPer1M: 1.5, cachedInputPer1M: 0.05 },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', inputPer1M: 0.6, outputPer1M: 3 },
];
