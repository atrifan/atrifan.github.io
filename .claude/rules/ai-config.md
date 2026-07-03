---
description: AI models, pricing, token budgets, and subscription tiers
appliesTo: ["src/config/ai-tokens.config.ts", "app/api/ai/**"]
alwaysApply: false
---

# AI Configuration

`src/config/ai-tokens.config.ts` is the single source of truth for models, pricing, and quotas.

```ts
export const AI_MODELS; export const EMBEDDING_MODELS; export const TOKEN_QUOTAS;
calculateTokenCost(modelId, inputTokens, outputTokens);
calculateSafeTokensForBudget(modelId, budgetUsd);
getEmbeddingModelsForTier(tier);
```

## Subscription tiers

| Tier | Price | AI Budget | Models |
|------|-------|-----------|--------|
| Free | $0 | $0 | None (local embeddings only); API + MCP + marketplace blocked |
| Pro  | $7/mo | $5 | ministral-3b |
| Plus | $14/mo | $5 | All models |

Plan checks use `src/config/billing.config.ts` (`isHigherOrEqualTo`, `isFreePlan`, `PLAN_RANKINGS`).
Clerk billing webhooks update `publicMetadata.plan`, mirrored onto `api_keys.plan`.
