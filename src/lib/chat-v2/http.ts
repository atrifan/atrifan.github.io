export const securityHeaders = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache', Expires: '0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  Vary: 'Cookie, Authorization, Origin',
};

export class RelayError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export function errorResponse(error: unknown): Response {
  const e = error instanceof RelayError ? error : new RelayError(503, 'broker_unavailable');
  return Response.json({ error: e.code }, { status: e.status, headers: securityHeaders });
}

export function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { ...securityHeaders, Allow: 'POST' } });
}

export function invalid(): never { throw new RelayError(400, 'invalid_request'); }
export function unauthorized(): never { throw new RelayError(401, 'unauthorized'); }

/** Enforce actual streamed bytes, including requests without Content-Length. */
export async function readBody(req: Request, signal: AbortSignal = req.signal): Promise<unknown> {
  if (!req.body) return invalid();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RelayError(504, 'timeout')), 5000);
    abort = () => reject(new RelayError(504, 'timeout'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > 128 * 1024) throw new RelayError(413, 'payload_too_large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return invalid(); }
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function originOf(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:' || url.username || url.password || url.origin === 'null') return null;
    return url.origin;
  } catch { return null; }
}

/** The extra origins allowed to use the viewer routes: NEXT_PUBLIC_APP_URL plus the comma list CHAT_ALLOWED_ORIGINS (origins or bare hosts). */
export function configuredViewerOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = [env.NEXT_PUBLIC_APP_URL ?? '', ...(env.CHAT_ALLOWED_ORIGINS ?? '').split(',')];
  return [...new Set(values.map(originOf).filter((o): o is string => !!o))];
}

/**
 * A viewer request must come from the site that served it (its Origin equals the host the request reached) or from an
 * origin the operator listed. A new domain pointed at the app therefore works with no configuration.
 */
export function checkOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const own = originOf(new URL(req.url).origin);
  const allowed = origin !== null && (origin === own || configuredViewerOrigins().includes(origin));
  if (!allowed) throw new RelayError(403, 'forbidden_origin');
}
