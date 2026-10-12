import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { contractIdParam } from '@/src/lib/delivery/contract-data';
import { openDownload } from '@/src/lib/delivery/delivery-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: { id: string } };

/**
 * GET /api/contracts/[id]/delivery/download: the customer downloads the exact commit QA
 * validated, as a .tar.gz streamed through the platform (the provider's token never leaves
 * the server). 409 delivery_locked before QA + payment, 410 pat_purged once access ended.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const file = await openDownload(userId, contractIdParam(params));
    const headers: Record<string, string> = {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (file.contentLength) headers['Content-Length'] = file.contentLength;
    return new NextResponse(file.body, { status: 200, headers });
  });
}
