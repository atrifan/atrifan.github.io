export interface BackoffOptions {
  baseMs: number;
  factor: number;
  maxMs: number;
  /** Returns a number in [0, 1]. When set the delay lands in [delay/2, delay] ("equal jitter"). */
  jitter?: () => number;
}

/** Exponential delay for a 1-based attempt number, capped at `maxMs`. */
export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = opts.baseMs * Math.pow(opts.factor, n - 1);
  const capped = Math.min(opts.maxMs, raw);
  if (!opts.jitter) return capped;
  const half = capped / 2;
  return Math.round(half + opts.jitter() * half);
}

export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries: number;
  backoff: BackoffOptions;
  sleep: (ms: number) => Promise<void>;
  isRetryable: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt > opts.retries || !opts.isRetryable(err)) throw err;
      await opts.sleep(backoffDelay(attempt, opts.backoff));
    }
  }
}
