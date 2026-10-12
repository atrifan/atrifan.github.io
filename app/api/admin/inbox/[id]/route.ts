import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { parseBody, readJson } from '@/src/lib/jobs/http';
import { JobsError } from '@/src/lib/jobs/errors';
import { getThread, updateThread } from '@/src/lib/support/support-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const PatchSchema = z
  .object({ status: z.enum(['open', 'answered', 'closed']).optional(), notes: z.string().max(10_000).optional() })
  .strict();

function threadId(params: Ctx['params']): string {
  const r = z.string().uuid().safeParse(params?.id);
  if (!r.success) throw new JobsError('not_found', 404, 'Thread not found');
  return r.data;
}

/** GET /api/admin/inbox/[id] → `{ thread, messages }` (HTML sanitised). Admins only. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withQaAdmin(request, async () => NextResponse.json(await getThread(threadId(params))));
}

/** PATCH /api/admin/inbox/[id] `{ status?, notes? }` → `{ thread }`. Admins only. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return withQaAdmin(request, async () => {
    const id = threadId(params);
    const patch = parseBody(PatchSchema, await readJson(request));
    return NextResponse.json({ thread: await updateThread(id, patch) });
  });
}
