/**
 * Caller identity for /api/mcp requests that a path-key route (/api/mcp/[key],
 * /api/mcp/[key]/[serverName]) has already authenticated from the key in the URL.
 *
 * The path-key routes call the /api/mcp POST handler in process and pass this as its
 * second argument. Nothing an HTTP client sends can set it. Identity headers that used
 * to carry it (X-User-Id & co.) are stripped from every incoming request: they are
 * never credentials.
 */
export interface PathKeyIdentity {
  userId: string;
  apiKeyId?: string;
  serverName: string;
  plan: string;
  /** The key from the URL, for tools that call back into Tulzo with the caller's key. */
  apiKey: string;
}

/** The /api/mcp POST handler's second argument. Next.js passes `{ params }` only. */
export interface McpRouteContext {
  params?: unknown;
  pathKey?: PathKeyIdentity;
}

/** Request headers that once carried a forwarded identity. Lower-case; Headers is case-insensitive. */
export const CLIENT_IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-plan',
  'x-auth-method',
  'x-api-key-id',
  'x-server-name',
  'x-original-api-key',
] as const;

/** A copy of `headers` without any client-supplied identity header. */
export function stripClientIdentityHeaders(headers: Headers): Headers {
  const clean = new Headers(headers);
  for (const name of CLIENT_IDENTITY_HEADERS) clean.delete(name);
  return clean;
}
