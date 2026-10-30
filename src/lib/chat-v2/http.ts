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

export function checkOrigin(req: Request): void {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) throw new RelayError(500, 'server_misconfigured');
  let origin: string;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.username || url.password || url.origin === 'null') throw new Error();
    origin = url.origin;
  } catch { throw new RelayError(500, 'server_misconfigured'); }
  if (req.headers.get('origin') !== origin) throw new RelayError(403, 'forbidden_origin');
}
