/**
 * Who is calling a JSON route shared by every surface (notifications, activity): the gigs
 * Playwright identity header when enabled (never in production builds, see src/lib/jobs/http.ts),
 * otherwise the Clerk session. Plus the small fixed error bodies those routes answer with.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { e2eUser } from './jobs/http';

export async function sessionUserId(request: Request): Promise<string | null> {
  const testUser = e2eUser(request);
  if (testUser) return testUser;
  const { userId } = await auth();
  return userId ?? null;
}

export const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: 'forbidden' }, { status: 403 });
export const badRequest = (message: string) => NextResponse.json({ error: 'invalid_request', message }, { status: 400 });

/** Logs the cause server-side; the client gets a stable code only. */
export function unavailable(scope: string, err: unknown): NextResponse {
  console.error(`[${scope}] failed:`, err instanceof Error ? err.message : String(err));
  return NextResponse.json({ error: 'unavailable' }, { status: 503 });
}

/** Read a JSON body; empty or invalid JSON is null. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
