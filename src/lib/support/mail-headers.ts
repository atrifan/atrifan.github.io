/** Address and threading-header helpers for the support inbox. Pure. */

/** "Cara <cara@x.test>" → { name: "Cara", address: "cara@x.test" }; a bare address has no name. */
export function parseAddress(raw: string | null | undefined): { name: string | null; address: string } {
  const v = (raw ?? '').trim();
  const m = /^"?([^"<]*?)"?\s*<([^<>]+)>$/.exec(v);
  if (m) return { name: m[1].trim() || null, address: m[2].trim().toLowerCase() };
  return { name: null, address: v.toLowerCase() };
}

/** Message ids (`<...>`) in an In-Reply-To or References header value. */
export function messageIdsIn(value: string | null | undefined): string[] {
  return value ? (value.match(/<[^<>\s]+>/g) ?? []) : [];
}

/** A header value by case-insensitive name. */
export function headerValue(headers: Record<string, unknown> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? null : String(headers[key]);
}

/**
 * Headers for a reply in a thread: In-Reply-To is the latest inbound message id (the one being
 * answered), or the latest id at all; References lists every known id once, oldest first.
 */
export function replyHeaders(messages: ReadonlyArray<{ direction: 'inbound' | 'outbound'; message_id: string | null }>): Record<string, string> {
  const ids: string[] = [];
  let lastInbound: string | null = null;
  for (const m of messages) {
    const id = m.message_id?.trim();
    if (!id) continue;
    if (!ids.includes(id)) ids.push(id);
    if (m.direction === 'inbound') lastInbound = id;
  }
  const inReplyTo = lastInbound ?? ids[ids.length - 1];
  if (!inReplyTo) return {};
  return { 'In-Reply-To': inReplyTo, References: ids.join(' ') };
}
