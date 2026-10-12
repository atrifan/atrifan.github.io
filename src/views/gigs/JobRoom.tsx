'use client';

/**
 * JOB ROOM SLOT. The contract page's room: tabs Plan / Status / Activity / Artifacts /
 * Milestones / Messages / Steering / QA / Delivery (WAI-ARIA tabs, arrow keys move and
 * select). Plan and Status come from the contract itself. The other tabs read the job
 * room API through src/lib/jobs/client/room.ts once NEXT_PUBLIC_GIGS_JOB_ROOM is on;
 * until those endpoints ship they show empty states.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate } from '@/src/lib/jobs/client/format';
import {
  ROOM_TABS,
  createRoomClient,
  milestoneSummary,
  toActivityItems,
  toMessageItems,
  toMilestoneItems,
  toSteeringItems,
  type PartyRole,
  type RoomActivityEvent,
  type RoomMessage,
  type RoomMilestone,
  type RoomSteering,
  type RoomTabId,
} from '@/src/lib/jobs/client/room';

const EMPTY: Record<Exclude<RoomTabId, 'plan' | 'status'>, string> = {
  activity: 'Nothing here yet. Payments, submissions and QA results will show up here as they happen.',
  artifacts: 'Nothing here yet. Files and links the provider shares will appear here.',
  milestones: 'Nothing here yet. The provider will add milestones once work starts.',
  messages: 'Nothing here yet. Messages and progress updates between you and the provider will appear here.',
  steering: 'Nothing here yet. Clarifications, revisions and scope changes will appear here.',
  qa: 'Nothing here yet. When the work is submitted, an independent reviewer checks it against the acceptance criteria.',
  delivery: 'Nothing here yet. Once QA validates the work, you can download the reviewed commit here.',
};

interface Live {
  messages?: RoomMessage[];
  activity?: RoomActivityEvent[];
  milestones?: RoomMilestone[];
  steering?: RoomSteering[];
  error?: string;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="gigs-hint">{children}</p>;
}

export function JobRoom({
  contractId,
  role,
  plan,
  statusLabel,
  statusHint,
  enabled,
}: {
  contractId: string;
  role: PartyRole;
  plan: string | null;
  statusLabel: string;
  statusHint: string;
  enabled: boolean;
}) {
  const [selected, setSelected] = useState<RoomTabId>('plan');
  const [live, setLive] = useState<Live>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!enabled) return;
    const client = createRoomClient();
    let cancelled = false;
    (async () => {
      try {
        const [m, a, ms, s] = await Promise.all([
          client.messages(contractId),
          client.activity(contractId),
          client.milestones(contractId),
          client.steering(contractId),
        ]);
        if (!cancelled) setLive({ messages: m.messages, activity: a.events, milestones: ms.milestones, steering: s.steering });
      } catch (err) {
        if (!cancelled) setLive({ error: err instanceof Error ? err.message : 'The job room is not available yet.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, contractId]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ROOM_TABS.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setSelected(ROOM_TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  function panel(id: RoomTabId): ReactNode {
    if (id === 'plan') return plan ? <p className="gigs-prose">{plan}</p> : <Empty>The provider did not write a plan with the bid.</Empty>;
    if (id === 'status')
      return (
        <div className="stack">
          <p>
            <span className="gig-status">{statusLabel}</span>
          </p>
          <p className="gigs-hint">{statusHint}</p>
        </div>
      );
    if (live.error) return <Empty>{`${EMPTY[id]} (${live.error})`}</Empty>;
    if (id === 'messages' && live.messages?.length) {
      return (
        <ul className="gigs-feed" role="list">
          {toMessageItems(live.messages, role).map((m) => (
            <li key={m.id} className="gigs-feed-item">
              <span className="gigs-feed-meta">{`${m.author}${m.byAgent ? ' (agent)' : ''} · ${formatDate(m.at)}`}</span>
              <p className="gigs-prose">{m.body}</p>
            </li>
          ))}
        </ul>
      );
    }
    if (id === 'activity' && live.activity?.length) {
      return (
        <ul className="gigs-feed" role="list">
          {toActivityItems(live.activity, role).map((a) => (
            <li key={a.id} className="gigs-feed-item">
              <span className="gigs-feed-meta">{`${a.actor} · ${formatDate(a.at)}`}</span>
              <p>{a.summary}</p>
            </li>
          ))}
        </ul>
      );
    }
    if (id === 'milestones' && live.milestones?.length) {
      const sum = milestoneSummary(live.milestones);
      return (
        <div className="stack">
          <p>{`${sum.done} of ${sum.total} done (${sum.percent}%)`}</p>
          <ul className="gigs-feed" role="list">
            {toMilestoneItems(live.milestones).map((m) => (
              <li key={m.id} className="gigs-feed-item">
                <span className="gigs-feed-meta">{m.statusLabel}</span>
                <p>{m.title}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (id === 'steering' && live.steering?.length) {
      return (
        <ul className="gigs-feed" role="list">
          {toSteeringItems(live.steering, role).map((s) => (
            <li key={s.id} className="gigs-feed-item">
              <span className="gigs-feed-meta">{`${s.kindLabel} · ${s.statusLabel}`}</span>
              <p>{s.message}</p>
              {s.response ? <p className="gigs-hint">{s.response}</p> : null}
            </li>
          ))}
        </ul>
      );
    }
    return <Empty>{EMPTY[id]}</Empty>;
  }

  return (
    <section className="gigs-section" aria-labelledby="room-title" data-slot="job-room">
      <h2 id="room-title" className="gigs-section-title">
        Job room
      </h2>
      <div role="tablist" aria-label="Job room" className="gigs-room-tabs">
        {ROOM_TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`room-tab-${t.id}`}
            aria-selected={selected === t.id}
            aria-controls={`room-panel-${t.id}`}
            tabIndex={selected === t.id ? 0 : -1}
            className="gigs-room-tab"
            onClick={() => setSelected(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {ROOM_TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`room-panel-${t.id}`}
          aria-labelledby={`room-tab-${t.id}`}
          hidden={selected !== t.id}
          tabIndex={0}
          className="gigs-room-panel"
        >
          {selected === t.id ? panel(t.id) : null}
        </div>
      ))}
    </section>
  );
}
