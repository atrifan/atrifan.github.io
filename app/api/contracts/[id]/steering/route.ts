import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { CreateSteeringSchema, SteeringListSchema } from '@/src/lib/jobs/room-schemas';
import { createSteeringRequest, listSteering } from '@/src/lib/jobs/steering-service';

type Ctx = { params: { id: string } };

/** Steering requests on the contract. `?status=`, and `?since=<next_cursor>` for changes only. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const raw = Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''));
    const query = parseBody(SteeringListSchema, raw);
    return NextResponse.json(await listSteering(userId, params.id, query));
  });
}

/**
 * The customer asks for a clarification, revision or scope change. The platform decides the
 * kind (LLM proposal + rules: any spec, price or deadline change is a scope change).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const input = parseBody(CreateSteeringSchema, await readJson(request));
    return NextResponse.json(await createSteeringRequest(userId, params.id, input), { status: 201 });
  });
}
