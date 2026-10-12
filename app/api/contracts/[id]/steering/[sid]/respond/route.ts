import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { SteeringRespondSchema } from '@/src/lib/jobs/room-schemas';
import { respondSteering } from '@/src/lib/jobs/steering-service';

type Ctx = { params: { id: string; sid: string } };

/**
 * The provider answers a steering request from the web (the Jobs MCP has steering_respond):
 * `{ response, estimate_delta_cents?, eta_days?, deliverable_changes?, decline? }`.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const body = await readJson(request);
    const input = parseBody(SteeringRespondSchema, { ...(body as Record<string, unknown>), steering_id: params.sid });
    return NextResponse.json(await respondSteering(userId, input, null, params.id));
  });
}
