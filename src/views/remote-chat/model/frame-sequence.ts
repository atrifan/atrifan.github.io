// Ordering of device → page frames. /api/plugin/chat/receive returns
// { frames: [{ seq, frame }], cursor }, where seq is the relay's BIGSERIAL stamped
// on arrival. The page keeps a cursor and applies each seq once, in order — the
// same rule the assistant's relay applies to its own inbox (selectNewFrames in
// assistant/plugin/src/background/remote-relay.ts).

export interface WireFrame {
  type: string;
  [k: string]: unknown;
}

export interface SeqFrame {
  seq: number;
  frame: WireFrame;
}

function isWireFrame(v: unknown): v is WireFrame {
  return !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string';
}

/** Read a /receive body defensively: malformed envelopes are dropped, never thrown on. */
export function parseReceive(body: unknown): { frames: SeqFrame[]; cursor: number | null } {
  if (!body || typeof body !== 'object') return { frames: [], cursor: null };
  const raw = (body as { frames?: unknown }).frames;
  const c = (body as { cursor?: unknown }).cursor;
  const cursor = typeof c === 'number' && Number.isFinite(c) ? c : null;
  if (!Array.isArray(raw)) return { frames: [], cursor };
  const frames = raw.filter(
    (e): e is SeqFrame =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as SeqFrame).seq === 'number' &&
      Number.isFinite((e as SeqFrame).seq) &&
      isWireFrame((e as SeqFrame).frame),
  );
  return { frames, cursor };
}

/** Frames past `cursor`, each seq once, ascending; the cursor never moves back. */
export function takeFresh(frames: readonly SeqFrame[], cursor: number): { fresh: SeqFrame[]; cursor: number } {
  const seen = new Set<number>();
  const fresh = frames
    .filter((e) => e.seq > cursor && !seen.has(e.seq) && (seen.add(e.seq), true))
    .sort((a, b) => a.seq - b.seq);
  return { fresh, cursor: fresh.length ? fresh[fresh.length - 1].seq : cursor };
}
