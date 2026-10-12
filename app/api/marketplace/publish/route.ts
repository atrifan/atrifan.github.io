import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import {
  authenticateApiKey,
  needsArchive,
  publishPackage,
  type MarketplaceAuth,
  type PublishInput,
} from '@/src/lib/marketplace-service';
import { validatePublishInput } from '@/src/lib/marketplace/publish-validation';
import { bytesFilesHash } from '@/src/lib/marketplace/wire-format';
import { currentMarketplaceUser } from '@/src/lib/marketplace/web-auth';

/**
 * Marketplace publish: a new package or a new version. Every publish lands `pending` and needs
 * admin moderation to go public.
 *
 *   POST /api/marketplace/publish
 *   Authorization: Bearer <tulzo_api_key>   (the assistant; any paid plan)
 *   or a signed-in Clerk session              (the publisher page; paid plan or admin)
 *
 *   multipart/form-data: file=<zip>, id, name, description, type, version, tags, category,
 *                        long_description, config_json (JSON string)
 *   OR application/json:  { id, name, description, type, version, config_json, tags, category,
 *                           long_description }   (config kinds: mcp, a2a)
 */
export async function POST(req: NextRequest) {
  let auth: MarketplaceAuth;
  let publisherName: string | null = null;
  const header = req.headers.get('authorization');
  if (header) {
    const authResult = await authenticateApiKey(header);
    if (!authResult.ok) {
      const body =
        authResult.status === 403
          ? { valid: false, error: 'plan_required', plan: 'free' }
          : { error: authResult.error };
      return NextResponse.json(body, { status: authResult.status });
    }
    auth = authResult.auth;
  } else {
    const user = await currentMarketplaceUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.canPublish) return NextResponse.json({ error: 'plan_required', plan: user.plan }, { status: 403 });
    auth = { userId: user.userId, plan: user.plan };
    publisherName = user.displayName;
  }

  const contentType = req.headers.get('content-type') || '';
  let input: PublishInput;

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      input = {
        id: body.id,
        name: body.name,
        description: body.description,
        type: body.type,
        version: body.version,
        config_json: body.config_json ?? null,
        tags: body.tags,
        category: body.category,
        long_description: body.long_description,
      };
    } else {
      const form = await req.formData();
      const text = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : undefined);
      const file = form.get('file');
      const configJsonStr = text('config_json');
      input = {
        id: text('id') ?? '',
        name: text('name') ?? '',
        type: text('type') ?? '',
        description: text('description'),
        version: text('version') || '1.0.0',
        tags: text('tags'),
        category: text('category'),
        long_description: text('long_description'),
        config_json: configJsonStr ? JSON.parse(configJsonStr) : null,
      };
      if (file instanceof Blob && file.size > 0 && needsArchive(input.type)) {
        // Validate before uploading so a bad request never leaves a blob behind.
        const pre = validatePublishInput({ ...input, blob_url: 'pending-upload' } as unknown as Record<string, unknown>);
        if (!pre.ok) return NextResponse.json({ error: pre.error }, { status: 400 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const blob = await put(`packages/${pre.value.id}/${pre.value.version}.zip`, file, {
          access: 'public',
          contentType: 'application/zip',
        });
        input.blob_url = blob.url;
        input.files_hash = bytesFilesHash(bytes);
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request body' }, { status: 400 });
  }

  const result = await publishPackage(auth, input, { publisherName });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  try {
    const usageDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await usageDb.from('api_usage_log').insert({
      user_id: auth.userId,
      event_type: 'marketplace_publish',
      metadata: { package_id: result.id, version: result.version, type: input.type },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json(result);
}
