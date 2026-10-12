import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { parseBody, readJson } from '@/src/lib/jobs/http';
import { JobsError } from '@/src/lib/jobs/errors';
import { replyToThread, SupportMisconfiguredError } from '@/src/lib/support/support-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const ReplySchema = z.object({ text: z.string() }).strict();

/**
 * POST /api/admin/inbox/[id]/reply `{ text }` → 201 `{ message }`. Sends the reply from
 * LEGAL_CONTACT_EMAIL with In-Reply-To/References and the reference in the subject; the thread
 * becomes `answered`. Admins only.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withQaAdmin(request, async (adminUserId) => {
    const id = z.string().uuid().safeParse(params?.id);
    if (!id.success) throw new JobsError('not_found', 404, 'Thread not found');
    const { text } = parseBody(ReplySchema, await readJson(request));
    try {
      return NextResponse.json({ message: await replyToThread(adminUserId, id.data, text) }, { status: 201 });
    } catch (err) {
      if (err instanceof SupportMisconfiguredError) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
      throw err;
    }
  });
}
