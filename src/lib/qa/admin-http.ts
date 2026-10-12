/**
 * Auth wrapper for the hub /admin/qa page's thin API routes (app/api/admin/qa/{queue,submissions}).
 * The caller is the Clerk session (or the gigs e2e identity in tests); admin rights as in
 * src/lib/qa/admin-auth.ts. Signed out → 401, non-admin → 403; JobsErrors map to JSON.
 */
import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { JobsError } from '../jobs/errors';
import { e2eUser, errorResponse, requireUserId } from '../jobs/http';
import { isAdminUserId } from '../admin';
import { clerkAdmin } from './admin-auth';

export async function withQaAdmin(
  request: Request,
  fn: (adminUserId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const userId = await requireUserId(request);
    // The e2e identity has no Clerk user to look up: for it only ADMIN_USER_IDS counts (as in authenticateQaCaller).
    const admin = e2eUser(request) ? await isAdminUserId(userId, { lookup: null }) : await clerkAdmin(userId);
    if (!admin) throw new JobsError('forbidden', 403, 'Admin access required');
    return await fn(userId);
  } catch (err) {
    return errorResponse(err);
  }
}

/** The `[id]` route segment, validated as a submission uuid (400 otherwise). */
export function submissionIdParam(params: { id?: string } | undefined): string {
  const r = z.string().uuid().safeParse(params?.id);
  if (!r.success) throw new JobsError('invalid_request', 400, 'Submission id must be a UUID');
  return r.data;
}
