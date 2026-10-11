import { NextRequest } from 'next/server';
import { hasSupabaseEnv } from '../fixtures/seed';

/** True when the Supabase project from .env.local is reachable by config. */
export const dbReady = hasSupabaseEnv();

/** Build a NextRequest for calling a route handler directly. */
export function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}
