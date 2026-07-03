import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { del } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/src/lib/admin';

const supabase = createClient(
  process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .select('*')
    .eq('id', id)
    .single();

  if (pkgError || !pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const { data: versions } = await supabase
    .from('package_versions')
    .select('*')
    .eq('package_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ package: pkg, versions: versions || [] });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: versions } = await supabase
    .from('package_versions')
    .select('blob_url')
    .eq('package_id', id);

  if (versions?.length) {
    const urls = versions.map(v => v.blob_url).filter(Boolean);
    if (urls.length) {
      await del(urls).catch(() => {});
    }
  }

  const { error } = await supabase.from('packages').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH — admin moderation. Approve or hide a (user-published) package by
 * setting its visibility. Body: { visibility: 'public' | 'pending' | 'private' }.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  let visibility: string;
  try {
    ({ visibility } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!['public', 'pending', 'private'].includes(visibility)) {
    return NextResponse.json({ error: 'visibility must be public, pending, or private' }, { status: 400 });
  }

  const { error } = await supabase
    .from('packages')
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, visibility });
}
