import { describe, expect, it } from 'vitest';
import { pickDevice, presenceOf, relativeTime, sortDevices } from '@/src/views/remote-chat/model/presence';

const NOW = Date.parse('2026-10-12T12:00:00.000Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe('relativeTime', () => {
  it('returns null for missing or unparseable timestamps', () => {
    for (const v of [null, undefined, '', 'not a date']) expect(relativeTime(v, NOW)).toBeNull();
  });

  it('says "just now" under a minute, and for clock skew into the future', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(59), NOW)).toBe('just now');
    expect(relativeTime(ago(-300), NOW)).toBe('just now');
  });

  it('counts whole minutes, hours and days, rounding down', () => {
    expect(relativeTime(ago(60), NOW)).toBe('1 min ago');
    expect(relativeTime(ago(119), NOW)).toBe('1 min ago');
    expect(relativeTime(ago(59 * 60 + 59), NOW)).toBe('59 min ago');
    expect(relativeTime(ago(3600), NOW)).toBe('1 h ago');
    expect(relativeTime(ago(23 * 3600 + 3599), NOW)).toBe('23 h ago');
    expect(relativeTime(ago(86400), NOW)).toBe('1 d ago');
    expect(relativeTime(ago(3 * 86400 + 5), NOW)).toBe('3 d ago');
  });
});

describe('presenceOf', () => {
  it('online from a fresh heartbeat', () => {
    expect(presenceOf({ status: 'online', last_seen_at: ago(5) }, { now: NOW })).toEqual({
      state: 'online',
      label: 'Your assistant is online',
      detail: null,
    });
  });

  it('online from the live in-browser bridge even when the heartbeat is stale', () => {
    expect(presenceOf({ status: 'offline', last_seen_at: ago(7200) }, { now: NOW, live: true }).state).toBe('online');
    expect(presenceOf({ status: 'never_connected', last_seen_at: null }, { now: NOW, live: true }).state).toBe('online');
  });

  it('offline with when it was last seen', () => {
    expect(presenceOf({ status: 'offline', last_seen_at: ago(25 * 60) }, { now: NOW })).toEqual({
      state: 'offline',
      label: 'Your assistant is offline',
      detail: 'Last seen 25 min ago',
    });
  });

  it('offline without a known last-seen time has no detail', () => {
    expect(presenceOf({ status: 'offline', last_seen_at: null }, { now: NOW })).toEqual({
      state: 'offline',
      label: 'Your assistant is offline',
      detail: null,
    });
  });

  it('never connected', () => {
    expect(presenceOf({ status: 'never_connected', last_seen_at: null }, { now: NOW })).toEqual({
      state: 'never',
      label: "Your assistant hasn't connected yet",
      detail: null,
    });
  });

  it('no device at all', () => {
    expect(presenceOf(null, { now: NOW })).toEqual({
      state: 'never',
      label: 'No assistant connected',
      detail: null,
    });
  });
});

type D = { id: string; device_name: string; status: 'online' | 'offline' | 'never_connected'; last_seen_at: string | null };
const dev = (id: string, status: D['status'], seen: number | null): D => ({
  id,
  device_name: id,
  status,
  last_seen_at: seen === null ? null : ago(seen),
});

describe('sortDevices', () => {
  it('puts online devices first, then the most recently seen, never-seen last', () => {
    const list = [dev('never', 'never_connected', null), dev('old', 'offline', 9000), dev('on', 'online', 30), dev('recent', 'offline', 900)];
    expect(sortDevices(list).map((d) => d.id)).toEqual(['on', 'recent', 'old', 'never']);
  });

  it('a live-bridge device counts as online', () => {
    const list = [dev('a', 'offline', 100), dev('b', 'offline', 9000)];
    expect(sortDevices(list, (d) => d.id === 'b').map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('orders two online devices by last seen and does not mutate the input', () => {
    const list = [dev('a', 'online', 300), dev('b', 'online', 10)];
    expect(sortDevices(list).map((d) => d.id)).toEqual(['b', 'a']);
    expect(list.map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('pickDevice', () => {
  const list = [dev('a', 'offline', 100), dev('b', 'online', 10)];

  it('honours a requested device that exists', () => {
    expect(pickDevice(list, 'a')?.id).toBe('a');
  });

  it('falls back to the best device when the request is missing or unknown', () => {
    expect(pickDevice(list, null)?.id).toBe('b');
    expect(pickDevice(list, 'zzz')?.id).toBe('b');
  });

  it('returns null with no devices', () => {
    expect(pickDevice([], 'a')).toBeNull();
  });
});
