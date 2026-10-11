import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { DraftSpecRequestSchema } from '@/src/lib/jobs/schemas';
import { saveSpecDraft } from '@/src/lib/jobs/jobs-service';
import { draftSpecWithAi } from '@/src/lib/jobs/spec-builder';

type Ctx = { params: { id: string } };

/**
 * Save a new draft spec version. With `{ spec }` it is saved as written (free);
 * otherwise the AI drafts it from the job post, billed to the caller's credits.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const body = parseBody(DraftSpecRequestSchema, await readJson(request));
    const spec = body.spec
      ? await saveSpecDraft(userId, params.id, body.spec, { source: 'manual' })
      : await draftSpecWithAi(userId, params.id, body.instructions);
    return NextResponse.json({ spec }, { status: 201 });
  });
}
