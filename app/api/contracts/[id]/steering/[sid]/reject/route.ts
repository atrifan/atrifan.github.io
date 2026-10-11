import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { rejectSteering } from '@/src/lib/jobs/steering-service';

type Ctx = { params: { id: string; sid: string } };

/** The customer rejects (or withdraws) a pending scope change; work resumes on the current version. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await rejectSteering(userId, params.id, params.sid)));
}
