import { NextRequest, NextResponse } from 'next/server';
import { withUser, parseBody } from '@/src/lib/jobs/http';
import { ContractListSchema } from '@/src/lib/jobs/room-schemas';
import { listContractsForUser } from '@/src/lib/jobs/room-service';

/** Contracts where the caller is the customer or the provider. `?role=customer|provider&status=`. */
export async function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    const params = Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''));
    const query = parseBody(ContractListSchema, params);
    return NextResponse.json({ contracts: await listContractsForUser(userId, query) });
  });
}
