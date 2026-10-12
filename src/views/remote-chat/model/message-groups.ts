// Grouping a conversation into runs by speaker (one label per run) and ordering
// the chats list.

export interface Groupable {
  id: string;
  role: 'user' | 'assistant';
}

export interface MessageGroup<T extends Groupable> {
  /** The first message's id: stable while the group grows during streaming. */
  key: string;
  role: T['role'];
  items: T[];
}

/** Consecutive messages from the same speaker form one group. */
export function groupMessages<T extends Groupable>(entries: readonly T[]): MessageGroup<T>[] {
  const groups: MessageGroup<T>[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.role === entry.role) last.items.push(entry);
    else groups.push({ key: entry.id, role: entry.role, items: [entry] });
  }
  return groups;
}

function time(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
}

/** Newest first; unparseable dates last; ties keep their order. Returns a new array. */
export function sortSessions<T extends { updated_at: string }>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => time(b.updated_at) - time(a.updated_at));
}

/** The title shown for a chat. */
export function sessionTitle(session: { title: string | null }): string {
  return session.title?.trim() || 'Untitled chat';
}
