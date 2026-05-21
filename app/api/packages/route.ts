import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('updated_at', { ascending: false });

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

  if (!file || !id || !name || !type) {
    return NextResponse.json({ error: 'Missing required fields: file, id, name, type' }, { status: 400 });
  }

  if (!['plugin', 'skill', 'practitioner'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Must be plugin, skill, or practitioner' }, { status: 400 });
  }

  const blob = await put(`packages/${id}/${version}.zip`, file, {
    access: 'public',
    contentType: 'application/zip',
  });

  const { error: pkgError } = await supabase.from('packages').upsert({
    id,
    name,
    description,
    type,
    latest_version: version,
    blob_url: blob.url,
    updated_at: new Date().toISOString(),
    created_by: user.id,
  });

  if (pkgError) {
    return NextResponse.json({ error: pkgError.message }, { status: 500 });
  }

  const { error: verError } = await supabase.from('package_versions').insert({
    package_id: id,
    version,
    blob_url: blob.url,
  });

  if (verError) {
    return NextResponse.json({ error: verError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, version, url: blob.url });
}
