# Models API (`GET /api/models`)

Every chat model the Vercel AI Gateway offers, as callable through the Tulzo managed gateway
(`POST /api/chat`), with each model's context window, output limit, capabilities and the price Tulzo
bills. The gateway is a pass-through: when Vercel adds a model, it appears here and `/api/chat` accepts
it without a Tulzo change. The native host can read this list instead of shipping its own.

## Request

```http
GET https://tulzo.online/api/models
Authorization: Bearer <tulzo api key>
```

Auth works like `GET /api/plugin/config`:

| Case | Status | Body |
|---|---|---|
| No `Authorization: Bearer` header | 401 | `{ "error": "Missing Authorization header" }` |
| Unknown or revoked key | 401 | `{ "error": "Invalid or revoked API key" }` |
| Free plan | 403 | `{ "error": "plan_required" }` |
| Pro, Plus, Super | 200 | the list below |

`GET /api/plugin/config` returns `"models_url": "/api/models"`, so the host can discover the path
from config instead of hard-coding it.

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "openai/gpt-4o-mini",
      "name": "GPT-4o mini",
      "context_window": 128000,
      "max_output_tokens": 16384,
      "pricing": { "input_per_1m": 0.195, "output_per_1m": 0.78, "cached_input_per_1m": 0.0975 },
      "supports_tools": true,
      "supports_vision": true
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | The value to send as `model` to `POST /api/chat`. Exact, case-sensitive. |
| `name` | Display name. |
| `context_window` | Max input tokens, from Vercel's listing. `null` when Vercel doesn't report it or the listing is unavailable. |
| `max_output_tokens` | Max output tokens (Vercel's `max_tokens`). `null` like above. |
| `pricing.input_per_1m` / `output_per_1m` | USD per 1,000,000 tokens that Tulzo bills: Vercel's price × the markup (1.3 by default). Always numbers. |
| `pricing.cached_input_per_1m` | USD per 1M cached input tokens. Omitted when there's no cached price. |
| `supports_tools` | `tools` is in the model's supported parameters. `false` when unknown. |
| `supports_vision` | The model accepts image input. `false` when unknown. |

Entries are sorted by `id`. The default model for `/api/chat` is `openai/gpt-4o-mini`. The response may be cached by the client for 5 minutes
(`Cache-Control: private, max-age=300`).

## Where the data comes from

- **Which models:** Vercel's public listing `https://ai-gateway.vercel.sh/v1/models`, cached for an hour
  per server instance. Every entry with `type: "language"`, an input and an output price, and an id that
  doesn't end in `-batch` (batch variants are for Vercel's batch API, not chat). Embeddings, image, video
  and other model types aren't listed.
- **Prices:** Vercel's per-token price × 1,000,000 × `chatBillingMarkup()` (`src/lib/ai-gateway.ts`), which
  is `CREDIT_MARKUP` (default 1.3) for every key. `/api/chat` bills the gateway's reported cost for the call
  × the same markup, so the listed price is the billed price.
- **Context window, output limit, capabilities:** the same listing entry.
- **When Vercel can't be reached:** the last good listing is used. Without one, a built-in list
  (`src/config/gateway-models.ts`, 13 common models including the default) stands in, priced the same way,
  with `context_window`/`max_output_tokens` `null` and the capability flags `false`. `/api/chat` then accepts
  only those.
- **Long-context tiers:** some models cost more past ~200k input tokens (e.g. GPT-5.5, Claude Sonnet 4.5,
  Gemini 3.1 Pro). The listed price is the base tier; the billed amount follows the gateway's reported cost.

## A model that isn't listed

`POST /api/chat` with a `model` that isn't in this list answers before calling the gateway:

```json
HTTP 400
{
  "error": "Model \"openai/xyz\" is not offered by the Tulzo gateway. GET /api/models lists the models you can use.",
  "code": "model_not_allowed",
  "model": "openai/xyz",
  "models_url": "/api/models"
}
```

## The fallback list

Edit `src/config/gateway-models.ts` with the id and base price from Vercel's listing, and add the same
model to `tests/fixtures/vercel-models-snapshot.json`. `tests/unit/model-catalog.vitest.ts` fails when a
fallback id isn't a chat model in the snapshot or its price differs. Tests never fetch the live listing:
the runners set `AI_GATEWAY_MODELS_URL` to a closed local port.
