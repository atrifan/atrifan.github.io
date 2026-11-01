import { NextRequest } from 'next/server';
import {
  generateImage,
  generateImageViaChatCompletions,
  imageCostForModel,
} from '@/src/lib/ai-gateway';
import {
  IMAGE_MODELS_URL,
  fetchVercelListing,
  imageGenerationModels,
  modelNotAllowedBodyFor,
} from '@/src/lib/models/catalog';
import { authenticateImageRouteRequest, billImageRouteRequest, json } from '@/src/lib/image-route';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const auth = await authenticateImageRouteRequest(request);
  if (auth instanceof Response) return auth;
  const { supabase, userId, sessionId, apiKeyId } = auth;

  const body = await request.json() as Record<string, unknown>;
  const {
    model,
    prompt,
    stream,
    image,
    images,
    n,
    size,
    response_format,
    quality,
    background,
    moderation,
    output_format,
    output_compression,
    providerOptions,
  } = body;

  if (stream === true) {
    return json(400, { error: 'Image generations are non-streaming JSON only.' });
  }

  if (image !== undefined || images !== undefined) {
    return json(400, {
      error: 'Image-guided generation is not supported on POST /api/images/generations. Use prompt-only generation here, or POST /api/images/edits for the JSON edit flow Tulzo currently exposes.',
      code: 'image_edits_not_supported',
    });
  }

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return json(400, { error: 'Invalid request body: prompt required' });
  }

  if (typeof model !== 'string') {
    return json(400, modelNotAllowedBodyFor(String(model), IMAGE_MODELS_URL));
  }

  const offeredModel = imageGenerationModels(await fetchVercelListing()).find((entry) => entry.id === model);
  if (!offeredModel) {
    return json(400, modelNotAllowedBodyFor(model, IMAGE_MODELS_URL));
  }

  const result = offeredModel.type === 'language'
    ? await generateImageViaChatCompletions({
        model,
        prompt,
        ...(typeof n === 'number' ? { n } : {}),
        ...(typeof size === 'string' ? { size } : {}),
        ...(response_format === 'b64_json' || response_format === 'url' ? { response_format } : {}),
        ...(providerOptions && typeof providerOptions === 'object' ? { providerOptions: providerOptions as Record<string, unknown> } : {}),
      }, userId, sessionId)
    : await generateImage({
        model,
        prompt,
        ...(typeof n === 'number' ? { n } : {}),
        ...(typeof size === 'string' ? { size } : {}),
        ...(response_format === 'b64_json' || response_format === 'url' ? { response_format } : {}),
        ...(typeof quality === 'string' ? { quality } : {}),
        ...(typeof background === 'string' ? { background } : {}),
        ...(typeof moderation === 'string' ? { moderation } : {}),
        ...(typeof output_format === 'string' ? { output_format } : {}),
        ...(typeof output_compression === 'number' ? { output_compression } : {}),
        ...(providerOptions && typeof providerOptions === 'object' ? { providerOptions: providerOptions as Record<string, unknown> } : {}),
      }, userId, sessionId);

  const estimated = await imageCostForModel(model, typeof n === 'number' ? n : 1).catch(() => 0);
  await billImageRouteRequest({ supabase, userId, sessionId, apiKeyId, model, estimatedCost: estimated, generationId: result.generationId });

  return new Response(JSON.stringify({ created: result.created, data: result.data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
