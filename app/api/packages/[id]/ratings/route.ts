import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/packages/[id]/ratings
 * Returns aggregate rating, the caller's own rating, and recent reviews.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const { data: stat } = await supabase
    .from('package_rating_stats')
    .select('*')
    .eq('package_id', id)
    .maybeSingle();

  const { data: reviews } = await supabase
    .from('package_ratings')
    .select('user_id, rating, review, created_at')
    .eq('package_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const mine = (reviews || []).find((r) => r.user_id === userId);

  return NextResponse.json({
    avg_rating: stat?.avg_rating ?? null,
    rating_count: stat?.rating_count ?? 0,
    my_rating: mine?.rating ?? null,
    reviews: reviews || [],
  });
}

/**
 * POST /api/packages/[id]/ratings
 * Upsert the caller's rating (1-5) and optional review for a package.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  let rating: number;
  let review: string | undefined;
  try {
    const body = await req.json();
    rating = Number(body.rating);
    review = typeof body.review === 'string' ? body.review : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 });
  }

  // Ensure the package exists before recording a rating.
  const { data: pkg } = await supabase.from('packages').select('id').eq('id', id).maybeSingle();
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const { error } = await supabase.from('package_ratings').upsert(
    {
      package_id: id,
      user_id: userId,
      rating,
      review: review ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'package_id,user_id' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: stat } = await supabase
    .from('package_rating_stats')
    .select('*')
    .eq('package_id', id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    avg_rating: stat?.avg_rating ?? null,
    rating_count: stat?.rating_count ?? 0,
    my_rating: rating,
  });
}
