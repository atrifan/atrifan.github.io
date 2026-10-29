/**
 * GET a JSON endpoint, trying again after a failure. A request the page sends while Clerk is still
 * refreshing its 60s session token answers 401; a moment later the same request works. Treating
 * that first answer as data ("no devices", "no chats") showed the wrong page, so a non-2xx answer
 * or a network error is retried, and only after the last attempt does this give up with null.
 */
export async function getJsonRetrying<T>(
  url: string,
  {
    attempts = 4,
    delayMs = 750,
    fetchImpl = fetch,
    signal,
    sleep = (ms: number) => new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, ms);
      signal?.addEventListener('abort', finish, { once: true });
      if (signal?.aborted) finish();
    }),
  }: { attempts?: number; delayMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal } = {},
): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) return null;
    try {
      const res = await fetchImpl(url, { cache: 'no-store', ...(signal ? { signal } : {}) });
      if (res.ok) return (await res.json()) as T;
    } catch {
      /* network error: try again */
    }
    if (signal?.aborted) return null;
    if (attempt < attempts) await sleep(delayMs * attempt);
  }
  return null;
}
