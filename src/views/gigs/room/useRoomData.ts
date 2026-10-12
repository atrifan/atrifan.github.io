'use client';

/**
 * Job room data for one contract: the contract detail, the four live feeds and QA. Polls the
 * feeds with their `since` cursors every few seconds (paused while the tab is hidden), and
 * reloads the detail and QA when something happened. `refresh()` after an action.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createRoomClient,
  mergeById,
  mergeFeed,
  type RoomActivityEvent,
  type RoomClient,
  type RoomContractDetail,
  type RoomMessage,
  type RoomMilestone,
  type RoomQa,
  type RoomSteering,
} from '@/src/lib/jobs/client/room';

const POLL_MS = 4000;

export interface RoomData {
  detail: RoomContractDetail | null;
  messages: RoomMessage[];
  activity: RoomActivityEvent[];
  milestones: RoomMilestone[];
  steering: RoomSteering[];
  qa: RoomQa | null;
  loaded: boolean;
  error: string | null;
}

const EMPTY: RoomData = { detail: null, messages: [], activity: [], milestones: [], steering: [], qa: null, loaded: false, error: null };

export function useRoomData(contractId: string): {
  data: RoomData;
  client: RoomClient;
  refresh: () => Promise<void>;
  addMessage: (m: RoomMessage) => void;
} {
  const client = useMemo(() => createRoomClient(), []);
  const [data, setData] = useState<RoomData>(EMPTY);
  const cursors = useRef<{ messages: string | null; activity: string | null; milestones: string | null; steering: string | null }>({
    messages: null,
    activity: null,
    milestones: null,
    steering: null,
  });
  const busy = useRef(false);

  const poll = useCallback(
    async (full: boolean) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const c = cursors.current;
        const [m, a, ms, s] = await Promise.all([
          client.messages(contractId, c.messages),
          client.activity(contractId, c.activity),
          client.milestones(contractId, c.milestones),
          client.steering(contractId, { since: c.steering }),
        ]);
        const changed = full || a.events.length > 0 || s.steering.length > 0 || ms.milestones.length > 0;
        const [detail, qa] = changed ? await Promise.all([client.contract(contractId), client.qa(contractId)]) : [null, null];
        cursors.current = { messages: m.next_cursor, activity: a.next_cursor, milestones: ms.next_cursor, steering: s.next_cursor };
        setData((prev) => ({
          detail: detail ?? prev.detail,
          qa: qa ?? prev.qa,
          messages: mergeFeed(prev.messages, m.messages),
          activity: mergeFeed(prev.activity, a.events),
          milestones: mergeById(prev.milestones, ms.milestones),
          steering: mergeById(prev.steering, s.steering),
          loaded: true,
          error: null,
        }));
      } catch (err) {
        setData((prev) => ({ ...prev, loaded: true, error: err instanceof Error ? err.message : 'The job room could not be loaded.' }));
      } finally {
        busy.current = false;
      }
    },
    [client, contractId],
  );

  useEffect(() => {
    void poll(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll(false);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  const refresh = useCallback(async () => {
    // wait for an in-flight poll so the refresh isn't dropped
    for (let i = 0; i < 20 && busy.current; i++) await new Promise((r) => setTimeout(r, 100));
    await poll(true);
  }, [poll]);

  const addMessage = useCallback((m: RoomMessage) => {
    setData((prev) => ({ ...prev, messages: mergeFeed(prev.messages, [m]) }));
  }, []);

  return { data, client, refresh, addMessage };
}
