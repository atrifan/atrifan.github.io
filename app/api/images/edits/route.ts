import { NextRequest } from 'next/server';
import { GatewayRequestError, editImage, imageEditCostForModel } from '@/src/lib/ai-gateway';
import { IMAGE_MODELS_URL, imageEditModelPrice, modelNotAllowedBodyFor } from '@/src/lib/models/catalog';
import { authenticateImageRouteRequest, billImageRouteRequest, json } from '@/src/lib/image-route';

export const runtime = 'nodejs';
export const maxDuration = 300;

type JsonEditImage = { image_url?: unknown; file_id?: unknown };

function isAllowedImageUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('data:');
}

export async function POST(request: NextRequest) {
  const auth = await authenticateImageRouteRequest(request);
  if (auth instanceof Response) return auth;
  const { supabase, userId, sessionId, apiKeyId } = auth;

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json(415, {
      error: 'Unsupported media type. POST /api/images/edits currently accepts application/json only.',
    });
  }

  const body = await request.json() as Record<string, unknown>;
  const {
    model,
    prompt,
    images,
    file_id,
    stream,
    n,
    size,
    response_format,
    quality,
    background,
    moderation,
    output_format,
    output_compression,
    providerOptions,
    mask,
  } = body;

  if (stream === true) {
    return json(400, { error: 'Image edits are non-streaming JSON only.' });
  }

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return json(400, { error: 'Invalid request body: prompt required' });
  }

  if (typeof model !== 'string' || model.trim() === '') {
    return json(400, { error: 'Invalid request body: model required' });
  }

  const price = await imageEditModelPrice(model);
  if (!price) {
    return json(400, modelNotAllowedBodyFor(model, IMAGE_MODELS_URL));
  }

  if (file_id !== undefined) {
    return json(400, { error: 'file_id is not supported on POST /api/images/edits. Use images[].image_url instead.' });
  }

  if (mask !== undefined) {
    return json(400, { error: 'mask is not supported on POST /api/images/edits yet.' });
  }

  if (!Array.isArray(images) || images.length === 0) {
    return json(400, { error: 'Invalid request body: at least one source image is required' });
  }

  const normalizedImages: Array<{ image_url: string }> = [];
  for (const item of images as JsonEditImage[]) {
    if (!item || typeof item !== 'object') {
      return json(400, { error: 'Invalid request body: images must be objects with image_url' });
    }
    if (item.file_id !== undefined) {
      return json(400, { error: 'file_id is not supported on POST /api/images/edits. Use images[].image_url instead.' });
    }
    if (typeof item.image_url !== 'string' || item.image_url.trim() === '') {
      return json(400, { error: 'Invalid request body: images[].image_url required' });
    }
    if (!isAllowedImageUrl(item.image_url)) {
      return json(400, { error: 'Invalid request body: images[].image_url must use https: or data:' });
    }
    normalizedImages.push({ image_url: item.image_url });
  }

  try {
    const result = await editImage({
      model,
      prompt,
      images: normalizedImages,
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

    const estimated = await imageEditCostForModel(model, typeof n === 'number' ? n : 1).catch(() => 0);
    await billImageRouteRequest({ supabase, userId, sessionId, apiKeyId, model, estimatedCost: estimated, generationId: result.generationId });

    return new Response(JSON.stringify({ created: result.created, data: result.data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) return json(error.status, error.body);
    console.error('[images/edits] failed:', error instanceof Error ? error.message : String(error));
    return json(500, { error: 'image_edit_failed' });
  }
}
