import type { RelaySession } from '../frames';

/** Missing refreshed metadata revokes controls; it cannot reclassify a known native binding as web. */
export function preserveNativeOrigin(row: RelaySession, previous: RelaySession | undefined): RelaySession {
  if (row.native || !previous?.native) return row;
  return { ...row, native: { sessionId: previous.native.sessionId, surface: previous.native.surface, state: 'unknown' } };
}

export function surfaceLabel(surface: string | undefined): string {
  if (!surface?.trim()) return 'Unknown surface';
  const labels: Record<string, string> = { chrome: 'Panel', panel: 'Panel', cli: 'CLI', tui: 'CLI', stream: 'CLI', telegram: 'Telegram', schedule: 'Schedule', scheduler: 'Schedule', vscode: 'IDE', jetbrains: 'IDE' };
  return labels[surface.toLowerCase()] ?? surface.charAt(0).toUpperCase() + surface.slice(1);
}
export function lastActivity(session: RelaySession): number {
  if (typeof session.lastActivity === 'number' && Number.isFinite(new Date(session.lastActivity).getTime())) return session.lastActivity;
  const updated = Date.parse(session.updated_at);
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(session.created_at);
  return Number.isFinite(created) ? created : -Infinity;
}
export function sortActivity(sessions: readonly RelaySession[]): RelaySession[] {
  return [...sessions].sort((a, b) => lastActivity(b) - lastActivity(a));
}
export function historyGroup(session: RelaySession, now: number): 'Today' | 'Yesterday' | 'This week' | 'Older' {
  const at = lastActivity(session);
  if (!Number.isFinite(at)) return 'Older';
  const day = (time: number) => { const d = new Date(time); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };
  const difference = day(now) - day(at);
  return difference <= 0 ? 'Today' : difference === 1 ? 'Yesterday' : difference < 7 ? 'This week' : 'Older';
}
export function liveTime(time: number | undefined, now: number): string | null {
  if (time === undefined || !Number.isFinite(time)) return null;
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  return seconds < 10 ? 'just now' : seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)} min ago`;
}
