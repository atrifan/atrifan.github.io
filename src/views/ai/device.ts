'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BridgeRequest, Built } from '@/src/lib/bridge-commands';
import { useControlPanelData } from './useControlPanelData';

export type QueryStatus = 'disconnected' | 'loading' | 'error' | 'ready';

export interface DeviceQuery<T> {
  status: QueryStatus;
  data: T | null;
  error: string | null;
  reload: () => Promise<void>;
  /** Replace the data from a reply that carries the refreshed list. */
  apply: (raw: unknown) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs a read command on the connected device whenever the extension connects; `reload` re-runs it. */
export function useDeviceQuery<T>(req: BridgeRequest | null, normalize: (raw: unknown) => T): DeviceQuery<T> {
  const { connected, send } = useControlPanelData();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;
  const key = req ? JSON.stringify(req) : '';
  const reqRef = useRef(req);
  reqRef.current = req;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const r = reqRef.current;
    if (!r) return;
    const mine = ++seq.current;
    setError(null);
    try {
      const raw = await send(r);
      if (mine === seq.current) setData(normalizeRef.current(raw));
    } catch (e) {
      if (mine === seq.current) setError(message(e));
    }
  }, [send]);

  useEffect(() => {
    if (connected && key) reload();
  }, [connected, key, reload]);

  const apply = useCallback((raw: unknown) => setData(normalizeRef.current(raw)), []);

  // Loading only until the first answer: a refresh keeps showing the previous list.
  const status: QueryStatus = !connected ? 'disconnected' : error ? 'error' : data === null ? 'loading' : 'ready';
  return { status, data, error, reload, apply };
}

export interface DeviceAction {
  /** Key of the action in flight (for per-row busy state). */
  busy: string | null;
  error: string | null;
  notice: string | null;
  clear: () => void;
  /** Sends a built request; validation errors are shown without sending. Resolves to the reply, or null. */
  run: (key: string, built: Built | BridgeRequest, opts?: { notice?: (raw: unknown) => string | null }) => Promise<unknown | null>;
}

/** A change sent to the device, with its error (the handler's message) and an optional confirmation line. */
export function useDeviceAction(): DeviceAction {
  const { send } = useControlPanelData();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback<DeviceAction['run']>(
    async (key, built, opts) => {
      setError(null);
      setNotice(null);
      const req = 'ok' in built ? (built.ok ? built.request : null) : built;
      if (!req) {
        setError((built as { error: string }).error);
        return null;
      }
      setBusy(key);
      try {
        const raw = await send(req);
        const r = raw as { ok?: unknown; detail?: unknown; error?: unknown } | null;
        if (r && typeof r === 'object' && r.ok === false) {
          setError(String(r.detail ?? r.error ?? 'The device refused the change'));
          return null;
        }
        if (opts?.notice) setNotice(opts.notice(raw));
        return raw ?? {};
      } catch (e) {
        setError(message(e));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [send],
  );

  const clear = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);
  return { busy, error, notice, run, clear };
}
