import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey, publishPackage, type PublishInput } from '@/src/lib/marketplace-service';

/**
 * Marketplace publish — API-key-gated (any paid plan).
 *
 * The counterpart to discovery: lets the browser assistant (or any paid user)
 * publish a skill / plugin / MCP to the marketplace. User-published packages
 * land as `visibility: 'pending'` and require admin moderation to go public.
 *
 *   POST /api/marketplace/publish
 *   Authorization: Bearer <tulzo_api_key>
 *
 *   multipart/form-data: file=<zip>, id, name, description, type, version
 *   OR application/json:  { id, name, description, type:"mcp", version, config_json }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateApiKey(req.headers.get('authorization'));
  if (!authResult.ok) {
    const body =
      authResult.status === 403
        ? { valid: false, error: 'plan_required', plan: 'free' }
        : { error: authResult.error };
    return NextResponse.json(body, { status: authResult.status });
  }
  const { auth } = authResult;

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
      };
    } else {
      const form = await req.formData();
      const id = form.get('id') as string;
      const name = form.get('name') as string;
      const type = form.get('type') as string;
      const description = (form.get('description') as string) || '';
      const version = (form.get('version') as string) || '1.0.0';
      const file = form.get('file') as File | null;
      const configJsonStr = form.get('config_json') as string | null;

      let blobUrl: string | undefined;
      if (file) {
        const blob = await put(`packages/${id}/${version}.zip`, file, {
          access: 'public',
          contentType: 'application/zip',
        });
        blobUrl = blob.url;
      }

      input = {
        id,
        name,
        type,
        description,
        version,
        blob_url: blobUrl,
        config_json: configJsonStr ? JSON.parse(configJsonStr) : null,
      };
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request body' }, { status: 400 });
  }

  const result = await publishPackage(auth, input);
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
