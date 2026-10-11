/**
 * Helpers for the thin gigs API routes: auth, JSON parsing and error mapping.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import type { z } from 'zod';
import { JobsError } from './errors';
import { InvalidTransitionError } from './job-state';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Test-only identity for the Playwright API suite: when NODE_ENV is not 'production' AND
 * JOBS_E2E_AUTH_SECRET (16+ chars) is set, `x-e2e-user` is trusted if `x-e2e-secret`
 * matches. `next build` inlines NODE_ENV=production, so production bundles never take
 * this path. Never set JOBS_E2E_AUTH_SECRET in Vercel.
 */
function e2eUser(request: Request): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const secret = process.env.JOBS_E2E_AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  const user = request.headers.get('x-e2e-user');
  const given = request.headers.get('x-e2e-secret');
  if (!user || !given || !safeEqual(given, secret)) return null;
  return user;
}

/** The signed-in Clerk user id, or throws 401. */
export async function requireUserId(request: Request): Promise<string> {
  const testUser = e2eUser(request);
  if (testUser) return testUser;
  const { userId } = await auth();
  if (!userId) throw new JobsError('unauthorized', 401, 'Sign in required');
  return userId;
}

/** Parse a JSON body; an empty body is `{}`. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new JobsError('invalid_request', 400, 'Body must be JSON');
  }
}

export function parseBody<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new JobsError('invalid_request', 400, 'Invalid request body', r.error.issues);
  return r.data;
}

/** Next.js control-flow errors (dynamic usage, redirects, notFound) must propagate. */
function isNextInternalError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'));
}

export function errorResponse(err: unknown): NextResponse {
  if (isNextInternalError(err)) throw err;
  if (err instanceof JobsError) {
    const body: Record<string, unknown> = { error: err.code, message: err.message };
    if (err.code === 'invalid_request' && err.details) body.issues = err.details;
    return NextResponse.json(body, { status: err.status });
  }
  if (err instanceof InvalidTransitionError) {
    return NextResponse.json({ error: 'invalid_state', message: err.message }, { status: 409 });
  }
  console.error('[jobs] unexpected error:', err);
  return NextResponse.json({ error: 'internal_error', message: 'Something went wrong' }, { status: 500 });
}

/** Run a route body with the caller's user id; map thrown errors to JSON responses. */
export async function withUser(
  request: Request,
  fn: (userId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const userId = await requireUserId(request);
    return await fn(userId);
  } catch (err) {
    return errorResponse(err);
  }
}
