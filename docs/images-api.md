# Images API (`GET /api/models/images`, `POST /api/images/generations`, `POST /api/images/edits`)

Tulzo exposes a separate image surface from chat.

- `GET /api/models/images` lists the image models Tulzo currently offers, with the price Tulzo bills.
- `POST /api/images/generations` executes one **prompt-only** image-generation request.
- `POST /api/images/edits` executes one **JSON-only** image edit request.

Tulzo does not store generated, uploaded, or edited image files on its own servers.

## Discovery

Use `GET /api/plugin/config` to discover the two catalogs:

- `models_url: "/api/models"` — chat models only
- `image_models_url: "/api/models/images"` — image-generation and image-edit discovery

Do not use `GET /api/models` to discover image models.

## Image model catalog

### Request

```http
GET https://tulzo.online/api/models/images
Authorization: Bearer <tulzo api key>
```

Auth works like `GET /api/plugin/config` and `GET /api/models`:

| Case | Status | Body |
|---|---|---|
| No `Authorization: Bearer` header | 401 | `{ "error": "Missing Authorization header" }` |
| Unknown or revoked key | 401 | `{ "error": "Invalid or revoked API key" }` |
| Free plan | 403 | `{ "error": "plan_required" }` |
| Pro, Plus, Super | 200 | the list below |

### Response

```json
{
  "object": "list",
  "data": [
    {
      "type": "language",
      "id": "quiverai/arrow-2",
      "name": "Arrow 2",
      "pricing": {
        "input_per_1m": 5.2,
        "output_per_1m": 26,
        "cached_input_per_1m": 0.52
      },
      "input_modalities": ["text", "image"],
      "output_modalities": ["text", "image"],
      "response_formats": ["b64_json", "url"],
      "supports_stream": false,
      "supports_edits": false,
      "edits": null
    },
    {
      "type": "image",
      "id": "openai/gpt-image-1-mini",
      "name": "GPT Image 1 Mini",
      "pricing": {
        "input_per_1m": 2.6,
        "output_per_1m": 10.4,
        "cached_input_per_1m": 0.26
      },
      "input_modalities": ["text"],
      "output_modalities": ["image"],
      "response_formats": ["b64_json", "url"],
      "supports_stream": false,
      "supports_edits": true,
      "edits": {
        "content_types": ["application/json"],
        "image_sources": ["https", "data"],
        "file_id": false,
        "mask": false,
        "multipart": false
      }
    }
  ]
}
```

### Meaning

| Field | Meaning |
|---|---|
| `type` | The upstream model type. Image-only models stay `"image"`; language models that Tulzo can use for image output stay `"language"`. |
| `id` | The value to send as `model` to `POST /api/images/generations` or `POST /api/images/edits` when that route supports the model. Exact, case-sensitive. |
| `pricing.image_per_image` | USD per generated image that Tulzo bills: Vercel's listing price × Tulzo's markup. |
| `pricing.input_per_1m` / `output_per_1m` | Present when the upstream listing prices the model with token-like fields. |
| `input_modalities` / `output_modalities` | Modalities reported by the upstream listing. These are listing-derived facts, not a promise that every Tulzo route accepts every modality. |
| `response_formats` | Success formats `POST /api/images/generations` may return. |
| `supports_stream` | Always `false`; image routes are non-streaming JSON only. |
| `supports_edits` | Whether Tulzo currently proxies `POST /api/images/edits` for this exact model id. |
| `edits` | Route-specific metadata for `POST /api/images/edits`, or `null` when Tulzo does not proxy edits for that model. |

Notes:

- discovery pricing is always listing-derived: Vercel's model listing plus Tulzo's markup
- Tulzo does **not** infer image-route support loosely from `type` or `input_modalities`
- generation and edit support are explicit exact-id Tulzo allowlists
- image model discovery may intentionally omit public AI Gateway image models that are not usable on Tulzo's current gateway key

Entries are sorted by `id`. The response may be cached by the client for 5 minutes (`Cache-Control: private, max-age=300`).

## `POST /api/images/generations`

This route supports both:

- image-only upstream models (`type: "image"`)
- language models that can emit images (`type: "language"` with image output capability)

### Request

```http
POST https://tulzo.online/api/images/generations
x-api-key: ak_...
Content-Type: application/json

{
  "model": "spacexai/grok-imagine-image",
  "prompt": "A tiny blue bird on a branch",
  "response_format": "b64_json"
}
```

Required body fields:

- `model` — one id from `GET /api/models/images`
- `prompt` — the text prompt

Optional forwarded fields:

- `n`
- `size`
- `response_format`
- `quality`
- `background`
- `moderation`
- `output_format`
- `output_compression`
- `providerOptions`

`stream: true` is rejected.

`POST /api/images/generations` is currently **prompt-only**. If you need edits, do not send `image` or `images` here.

### Response

Tulzo returns OpenAI Images-style JSON:

```json
{
  "created": 1793528198,
  "data": [
    {
      "b64_json": "..."
    }
  ]
}
```

Each item in `data` contains either:

- `b64_json`
- `url`

For language models with image output, Tulzo calls the upstream chat-completions API and normalizes the result back to `{ created, data }`. When the upstream returns data URIs or base64-like image payloads, Tulzo prefers `b64_json`.

For some language-image models, the upstream may return inline SVG in `message.content` instead of `message.images`. Tulzo normalizes that into a `data:image/svg+xml;base64,...` URL item in `data`.

The generation response does **not** include pricing fields.

## `POST /api/images/edits`

Tulzo currently ships the honest JSON subset of Vercel's `/v1/images/edits` behavior.

Implemented in this pass:

- `Content-Type: application/json` only
- requires `model`, `prompt`, and at least one source image
- input shape: `images: [{ image_url: ... }]`
- `image_url` may be:
  - `https://...`
  - `data:image/...;base64,...`
- returns only `{ created, data }`

Not implemented in this pass:

- multipart uploads
- top-level `file_id`
- `images[].file_id`
- masks
- streaming partial results

### Request

```http
POST https://tulzo.online/api/images/edits
x-api-key: ak_...
Content-Type: application/json
```

```json
{
  "model": "openai/gpt-image-1-mini",
  "prompt": "Add a watercolor effect to this image",
  "images": [
    { "image_url": "https://example.com/source.png" }
  ],
  "response_format": "url"
}
```

Data URL example:

```json
{
  "model": "openai/gpt-image-1-mini",
  "prompt": "Turn this into pixel art",
  "images": [
    { "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." }
  ]
}
```

### Response

```json
{
  "created": 1730000111,
  "data": [
    { "url": "https://..." }
  ]
}
```

Or:

```json
{
  "created": 1730000111,
  "data": [
    { "b64_json": "iVBORw0KGgoAAA..." }
  ]
}
```

## Errors

Common responses:

| Case | Route | Status | Body |
|---|---|---|---|
| Missing `x-api-key` | generations, edits | 401 | `{ "error": "Missing x-api-key header" }` |
| Unknown key | generations, edits | 401 | `{ "error": "Invalid API key" }` |
| Inactive or revoked account key | generations, edits | 403 | account-key error string |
| QA review key | generations, edits | 403 | `{ "error": "QA review keys only work on /api/chat.", "code": "review_key_chat_only" }` |
| No balance | generations, edits | 402 | `{ "error": "Insufficient balance" }` |
| `stream: true` | generations | 400 | `{ "error": "Image generations are non-streaming JSON only." }` |
| `stream: true` | edits | 400 | `{ "error": "Image edits are non-streaming JSON only." }` |
| `image` / `images` sent to generations | generations | 400 | `{ "error": "Image-guided generation is not supported on POST /api/images/generations...", "code": "image_edits_not_supported" }` |
| missing `model` | edits | 400 | `{ "error": "Invalid request body: model required" }` |
| missing `prompt` | edits | 400 | `{ "error": "Invalid request body: prompt required" }` |
| missing or empty `images` | edits | 400 | `{ "error": "Invalid request body: at least one source image is required" }` |
| unsupported `image_url` scheme | edits | 400 | `{ "error": "Invalid request body: images[].image_url must use https: or data:" }` |
| `file_id` anywhere in the request | edits | 400 | `file_id is not supported...` |
| `mask` provided | edits | 400 | `mask is not supported...` |
| non-JSON content type | edits | 415 | `Unsupported media type...` |
| model not in `GET /api/models/images` for that route | generations, edits | 400 | `model_not_allowed` body |
| upstream image provider denies the model on Tulzo's current gateway key | generations, edits | exact upstream status | exact upstream JSON body |

`model_not_allowed` points at `/api/models/images`, not `/api/models`.

## Pricing and billing

Tulzo bills successful image generations and edits from the upstream generation cost when the gateway reports it, with a listing-derived fallback when needed, multiplied by the same markup used elsewhere (`CREDIT_MARKUP`, default `1.3`).

Catalog pricing and request billing are related but separate:

- discovery pricing comes from the Vercel model listing plus Tulzo markup
- generation and edit responses return only `{ created, data }`
- billing remains server-side

## Related note: chat vs image catalogs

`GET /api/models` remains the chat catalog. Image-only models are intentionally absent there. Language models that can also emit images may appear in both catalogs, with their truthful upstream `type: "language"` on each route.
