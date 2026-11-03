export const RECONNECTING = 'Reconnecting to your assistant…';
export const OFFLINE = 'Assistant offline or unavailable.';
export const OFFLINE_AFTER = 3;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

type Socket = { start(): Promise<void>; authorized(): boolean; close(reason?: 'unavailable', notify?: boolean): void };
type Reason = 'rotation' | 'unavailable';

/** Backoff after the nth consecutive failure: 1s, 2s, 4s, 8s, 16s, then every 30s. */
export function reconnectDelay(failures: number): number {
  return Math.min(BASE_DELAY * 2 ** Math.max(0, failures - 1), MAX_DELAY);
}

/**
 * Keeps one live relay connection alive: at most one attempt in flight at a time, automatic
 * retries with backoff after failed starts and non-rotation closes, and an immediate reconnect after rotation.
 */
export function connectRelay<T extends Socket>(options: {
  create: (onClose: (reason: Reason) => void) => T;
  onClient: (client: T | null) => void;
  onStatus: (message: string | null) => void;
}): { stop(): void } {
  let running = true;
  let current: T | null = null;
  let failures = 0;
  let attempted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const fail = () => {
    failures++;
    options.onClient(null);
    options.onStatus(failures >= OFFLINE_AFTER ? OFFLINE : RECONNECTING);
    timer = setTimeout(connect, reconnectDelay(failures));
  };
  function connect(): void {
    cancel();
    if (!running || current) return;
    if (attempted) options.onStatus(RECONNECTING);
    attempted = true;
    const instance: T = options.create((reason) => {
      if (!running || current !== instance) return;
      current = null; options.onClient(null);
      if (reason === 'rotation') connect();
      else fail();
    });
    current = instance;
    void instance.start().then(() => {
      if (!running || current !== instance) return;
      if (!instance.authorized()) throw new Error('unauthorized');
      failures = 0;
      options.onClient(instance); options.onStatus(null);
    }).catch(() => {
      if (!running || current !== instance) return;
      instance.close('unavailable', false);
      current = null;
      fail();
    });
  }
  connect();
  return {
    stop() {
      running = false; cancel();
      const old = current; current = null;
      old?.close('unavailable', false);
      options.onClient(null);
    },
  };
}
