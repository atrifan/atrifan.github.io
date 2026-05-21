import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = user.emailAddresses?.some(e => ADMIN_EMAILS.includes(e.emailAddress));
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: pkg } = await supabase.from('packages').select('id').eq('id', id).single();
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const version = formData.get('version') as string;
  const changelog = (formData.get('changelog') as string) || '';

  if (!file || !version) {
    return NextResponse.json({ error: 'Missing required fields: file, version' }, { status: 400 });
  }

  const blob = await put(`packages/${id}/${version}.zip`, file, {
    access: 'public',
    contentType: 'application/zip',
  });

  const { error: verError } = await supabase.from('package_versions').insert({
    package_id: id,
    version,
    blob_url: blob.url,
    changelog,
  });

  if (verError) {
    return NextResponse.json({ error: verError.message }, { status: 500 });
  }

  await supabase.from('packages').update({
    latest_version: version,
    blob_url: blob.url,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({ ok: true, version, url: blob.url });
}
