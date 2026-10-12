// Device presence for the chat header ("Your assistant is online / offline · last seen …")
// and the order devices are offered in. Pure: the caller passes the clock.

export type DeviceStatus = 'online' | 'offline' | 'never_connected';

export interface DeviceLike {
  id: string;
  device_name: string;
  status: DeviceStatus;
  last_seen_at: string | null;
}

export type PresenceState = 'online' | 'offline' | 'never';

export interface Presence {
  state: PresenceState;
  label: string;
  detail: string | null;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago"; null when the time is unknown. */
export function relativeTime(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

/**
 * What to tell the user about their assistant. `live` is the in-browser bridge
 * (the assistant runs in this very browser), which beats a stale heartbeat.
 */
export function presenceOf(
  device: Pick<DeviceLike, 'status' | 'last_seen_at'> | null,
  opts: { now: number; live?: boolean },
): Presence {
  if (!device) return { state: 'never', label: 'No assistant connected', detail: null };
  if (opts.live || device.status === 'online') {
    return { state: 'online', label: 'Your assistant is online', detail: null };
  }
  if (device.status === 'never_connected') {
    return { state: 'never', label: "Your assistant hasn't connected yet", detail: null };
  }
  const seen = relativeTime(device.last_seen_at, opts.now);
  return { state: 'offline', label: 'Your assistant is offline', detail: seen ? `Last seen ${seen}` : null };
}

function seenAt(d: DeviceLike): number {
  const t = d.last_seen_at ? Date.parse(d.last_seen_at) : Number.NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** Online (or live) first, then most recently seen; never-seen last. Returns a new array. */
export function sortDevices<T extends DeviceLike>(devices: readonly T[], isLive: (d: T) => boolean = () => false): T[] {
  const online = (d: T) => d.status === 'online' || isLive(d);
  return [...devices].sort((a, b) => {
    const byOnline = Number(online(b)) - Number(online(a));
    if (byOnline !== 0) return byOnline;
    return seenAt(b) - seenAt(a);
  });
}

/** The requested device if the user owns it, else the best one to chat with, else null. */
export function pickDevice<T extends DeviceLike>(
  devices: readonly T[],
  requestedId: string | null,
  isLive?: (d: T) => boolean,
): T | null {
  const requested = requestedId ? devices.find((d) => d.id === requestedId) : undefined;
  return requested ?? sortDevices(devices, isLive)[0] ?? null;
}
