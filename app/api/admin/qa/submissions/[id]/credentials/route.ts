import { NextRequest, NextResponse } from 'next/server';
import { submissionIdParam, withQaAdmin } from '@/src/lib/qa/admin-http';
import { getCredentials } from '@/src/lib/qa/qa-review-service';

export const dynamic = 'force-dynamic';

/**
 * POST → the decrypted PAT and a fresh review key. Starts the review (awaiting_qa →
 * in_review) and writes a `qa_credentials_get` audit row every time. Admins only.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withQaAdmin(request, async (adminUserId) =>
    NextResponse.json(await getCredentials(adminUserId, { submission_id: submissionIdParam(params) }), {
      headers: { 'Cache-Control': 'no-store' },
    }),
  );
}
