import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { del } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import { deletePackage, isVisibility, moderatePackage } from '@/src/lib/marketplace-service';
import { currentMarketplaceUser } from '@/src/lib/marketplace/web-auth';

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
  const user = await currentMarketplaceUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const result = await deletePackage(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  if (result.blobUrls.length) {
    await del(result.blobUrls).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH — admin moderation (src/lib/marketplace-service.ts moderatePackage). Approving
 * (`public`) also marks the package verified; `pending` or `private` clears that.
 * Body: { visibility: 'public' | 'pending' | 'private' }.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentMarketplaceUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  let visibility: unknown;
  try {
    ({ visibility } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isVisibility(visibility)) {
    return NextResponse.json({ error: 'visibility must be public, pending, or private' }, { status: 400 });
  }

  const result = await moderatePackage(id, visibility, user.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id, visibility });
}
