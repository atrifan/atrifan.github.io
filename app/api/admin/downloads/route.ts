import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import { isAdmin } from '@/src/lib/admin';

async function checkAdmin() {
  return isAdmin();
}

export async function GET() {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { blobs } = await list({ prefix: 'downloads/' });
  const downloads = blobs.map(b => ({
    url: b.url,
    pathname: b.pathname,
    size: b.size,
    uploadedAt: b.uploadedAt,
  }));

  return NextResponse.json({ downloads });
}

export async function POST(request: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const blob = await put(`downloads/${file.name}`, file, {
    access: 'public',
    addRandomSuffix: false,
  });

  return NextResponse.json({ url: blob.url, pathname: blob.pathname });
}

export async function DELETE(request: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
  }

  await del(url);
  return NextResponse.json({ ok: true });
}
