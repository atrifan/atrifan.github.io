import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { ProgressPostSchema } from '@/src/lib/jobs/room-schemas';
import { postProgress } from '@/src/lib/jobs/room-service';

type Ctx = { params: { id: string } };

/**
 * The provider posts a progress summary from the web (the Jobs MCP has progress_post).
 * `{ summary, details?, percent_complete? }` → 201 `{ message }`. The customer is emailed at
 * most once per contract per hour.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const body = await readJson(request);
    const input = parseBody(ProgressPostSchema, { ...(body as Record<string, unknown>), contract_id: params.id });
    return NextResponse.json({ message: await postProgress(userId, input, null) }, { status: 201 });
  });
}
