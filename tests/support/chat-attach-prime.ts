/**
 * Pure ordering rule for the simulated chat page: each SESSION_ATTACH must be preceded by its own
 * completed `/receive?after=latest` prime from the same page, and that prime must have started after the
 * page's previous attach. Ordering uses recorded sequence numbers only, never timestamps.
 *
 * Test-only fixture logic. Imports nothing from product code.
 */
export interface WireEvent {
  /** Monotonic sequence number assigned when the request was routed. */
  seq: number;
  /** Sequence number assigned when the fake device answered the request (absent while in flight). */
  completedSeq?: number;
  pageId: string;
  relayId: string;
  kind: 'prime' | 'attach';
  watchId?: string;
}

/** Returns null when `attach` has its own completed pre-attach prime, otherwise the reason it does not. */
export function primeViolation(events: WireEvent[], attach: WireEvent): string | null {
  const previous = events
    .filter((e) => e.kind === 'attach' && e.pageId === attach.pageId && e.relayId === attach.relayId && e.seq < attach.seq)
    .reduce((max, e) => Math.max(max, e.seq), 0);
  const primes = events.filter((e) => e.kind === 'prime' && e.pageId === attach.pageId && e.relayId === attach.relayId);
  const own = primes.filter((p) => p.seq > previous && p.completedSeq !== undefined && p.completedSeq < attach.seq);
  if (own.length > 0) return null;

  if (primes.length === 0) return `no /receive?after=latest prime from this page for this relay session before watch ${attach.watchId}`;
  if (primes.some((p) => p.seq > attach.seq)) {
    return `the prime for watch ${attach.watchId} was sent after SESSION_ATTACH; priming must complete first`;
  }
  if (primes.some((p) => p.seq > previous && p.completedSeq === undefined)) {
    return `the prime for watch ${attach.watchId} did not complete before SESSION_ATTACH was sent`;
  }
  if (primes.some((p) => p.seq > previous && p.completedSeq !== undefined && p.completedSeq > attach.seq)) {
    return `the prime for watch ${attach.watchId} completed after SESSION_ATTACH was sent`;
  }
  return `the only prime from this page predates its previous SESSION_ATTACH, so it cannot prime watch ${attach.watchId}`;
}

/**
 * A device event the test declares fresh must sit above its snapshot's `through` watermark. Replays at or below
 * the watermark are inert by design and are only built with the plain fixture helper. Null when fresh.
 */
export function staleEventViolation(through: number, eventSeq: number): string | null {
  return eventSeq > through ? null : `eventSeq ${eventSeq} is at or below the snapshot watermark through ${through}`;
}
