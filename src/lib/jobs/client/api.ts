/**
 * Browser calls to the gigs API (same origin, Clerk cookie). Never throws for HTTP errors:
 * the caller branches on `status` / `error` (`{ error, message }` bodies, see
 * src/lib/jobs/http.ts).
 */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  message: string | null;
}

export async function apiJson<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, data: null, error: 'network_error', message: 'You seem to be offline. Check your connection and try again.' };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; message?: unknown };
  if (res.ok) return { ok: true, status: res.status, data: body as T, error: null, message: null };
  return {
    ok: false,
    status: res.status,
    data: null,
    error: typeof b.error === 'string' ? b.error : `http_${res.status}`,
    message: typeof b.message === 'string' ? b.message : 'Something went wrong. Please try again.',
  };
}
