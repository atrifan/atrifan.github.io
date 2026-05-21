import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get('type');

  let query = supabase
    .from('packages')
    .select('*')
    .order('updated_at', { ascending: false });

  if (typeFilter) {
    query = query.eq('type', typeFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ packages: data });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = user.emailAddresses?.some(e => ADMIN_EMAILS.includes(e.emailAddress));
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const description = (formData.get('description') as string) || '';
  const type = formData.get('type') as string;
  const version = (formData.get('version') as string) || '1.0.0';
  const configJsonStr = formData.get('config_json') as string | null;

  if (!id || !name || !type) {
    return NextResponse.json({ error: 'Missing required fields: id, name, type' }, { status: 400 });
  }

  if (!['plugin', 'skill', 'practitioner', 'mcp'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Must be plugin, skill, practitioner, or mcp' }, { status: 400 });
  }

  // MCP type requires config_json instead of file
  let configJson: Record<string, unknown> | null = null;
  if (type === 'mcp') {
    if (!configJsonStr) {
      return NextResponse.json({ error: 'MCP type requires config_json' }, { status: 400 });
    }
    try {
      configJson = JSON.parse(configJsonStr);
    } catch {
      return NextResponse.json({ error: 'Invalid config_json: must be valid JSON' }, { status: 400 });
    }
    const cfg = configJson as any;
    if (!cfg.transport || !['http', 'sse', 'stdio'].includes(cfg.transport)) {
      return NextResponse.json({ error: 'config_json must include transport (http, sse, or stdio)' }, { status: 400 });
    }
    if ((cfg.transport === 'http' || cfg.transport === 'sse') && !cfg.url) {
      return NextResponse.json({ error: 'config_json must include url for http/sse transport' }, { status: 400 });
    }
    if (cfg.transport === 'stdio' && !cfg.command) {
      return NextResponse.json({ error: 'config_json must include command for stdio transport' }, { status: 400 });
    }
  } else if (!file) {
    return NextResponse.json({ error: 'Missing required field: file' }, { status: 400 });
  }

  let blobUrl = '';
  if (file) {
    const blob = await put(`packages/${id}/${version}.zip`, file, {
      access: 'public',
      contentType: 'application/zip',
    });
    blobUrl = blob.url;
  }

  const { error: pkgError } = await supabase.from('packages').upsert({
    id,
    name,
    description,
    type,
    latest_version: version,
    blob_url: blobUrl,
    updated_at: new Date().toISOString(),
    created_by: user.id,
    ...(configJson ? { config_json: configJson } : {}),
  });

  if (pkgError) {
    return NextResponse.json({ error: pkgError.message }, { status: 500 });
  }

  if (blobUrl) {
    const { error: verError } = await supabase.from('package_versions').insert({
      package_id: id,
      version,
      blob_url: blobUrl,
    });

    if (verError) {
      return NextResponse.json({ error: verError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id, version, url: blobUrl || undefined });
}
