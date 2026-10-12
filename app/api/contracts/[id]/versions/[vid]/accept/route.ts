import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { acceptProposedVersion } from '@/src/lib/jobs/steering-service';

type Ctx = { params: { id: string; vid: string } };

/** The provider signs the terms the customer proposed in a scope change (MCP: contract_accept_version). */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await acceptProposedVersion(userId, params.id, params.vid, null)));
}
