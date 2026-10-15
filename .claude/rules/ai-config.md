---
description: AI models, pricing, token budgets, and subscription tiers
appliesTo: ["src/config/ai-tokens.config.ts", "app/api/chat/**"]
alwaysApply: false
---

# AI Configuration

The managed gateway (`/api/chat`, `/api/models`, gigs spec builder and steering) uses
`src/config/gateway-models.ts`: the only allowlist, with the prices `calculateCost()` bills (see
`docs/models-api.md`). `src/config/ai-tokens.config.ts` still holds the plan quotas and the older model
table used by the native `/api/mcp` LLM tool in `src/config/tool-handlers.ts`.

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
