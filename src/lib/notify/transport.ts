export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  /** Passed to the provider so a retried request is not sent twice. */
  idempotencyKey?: string;
}

export interface SendResult {
  id: string | null;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<SendResult>;
}

/** Transport error that says whether trying again could help (network, 429, 5xx). */
export class TransportError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, retryable: boolean, status: number | null = null) {
    super(message);
    this.name = 'TransportError';
    this.retryable = retryable;
    this.status = status;
  }
}

export function isRetryableError(err: unknown): boolean {
  return err instanceof TransportError ? err.retryable : true;
}

const RESEND_URL = 'https://api.resend.com/emails';

/** Resend over plain fetch, so status codes map cleanly onto retryable vs. not. */
export function createResendTransport(apiKey: string, fetchImpl: typeof fetch = fetch): EmailTransport {
  return {
    async send(message) {
      let res: Response;
      try {
        res = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            headers: message.headers,
          }),
        });
      } catch (err) {
        throw new TransportError(`network error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 500);
        const retryable = res.status === 429 || res.status >= 500;
        throw new TransportError(`resend ${res.status}: ${body}`, retryable, res.status);
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { id: json.id ?? null };
    },
  };
}

/** In-memory transport for tests: records messages, can fail the next N sends. */
export class MemoryTransport implements EmailTransport {
  readonly sent: EmailMessage[] = [];
  private failures: TransportError[] = [];

  failNext(...errors: TransportError[]): void {
    this.failures.push(...errors);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(message);
    return { id: `mem_${this.sent.length}` };
  }
}
