'use client';

/**
 * The job room on the contract page, for both parties: tabs Plan / Status / Activity /
 * Artifacts / Milestones / Messages / Steering / QA / Delivery (WAI-ARIA tabs; arrow keys move
 * and select; `?tab=<id>` deep-links). The data comes from the job room API through
 * src/lib/jobs/client/room.ts and is polled with `since` cursors (./room/useRoomData.ts). The
 * provider can post progress, keep milestones and answer steering from here as well as from
 * the Jobs MCP. Progress summaries only: no agent logs. No ads.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { ROOM_TABS, tabFromQuery, type PartyRole, type RoomTabId } from '@/src/lib/jobs/client/room';
import type { ContractStatus } from '@/src/lib/jobs/job-state';
import { useRoomData } from './room/useRoomData';
import { PlanTab, StatusTab } from './room/PlanStatus';
import { ActivityTab, MessagesTab, MilestonesTab } from './room/Feeds';
import { SteeringTab } from './room/SteeringTab';
import { ArtifactsTab, QaTab } from './room/QaTabs';
import { DeliverySlot, type DeliveryPanelComponent } from './room/DeliverySlot';
import { STATUS_HINT } from './room/status-hints';
import { deliveryPanel as mountedDeliveryPanel } from './room/delivery-panel';

const WORKING = new Set<string>(['active', 'rework']);

export function JobRoom({
  contractId,
  role,
  plan,
  initialStatus,
  initialDeadline,
  deliveryPanel = mountedDeliveryPanel,
}: {
  contractId: string;
  role: PartyRole;
  plan: string | null;
  initialStatus: ContractStatus;
  initialDeadline: string | null;
  /** Phase 5's Delivery panel (default: ./room/delivery-panel.ts); a placeholder without it. Client callers only. */
  deliveryPanel?: DeliveryPanelComponent;
}) {
  const params = useSearchParams();
  const [selected, setSelected] = useState<RoomTabId>(() => tabFromQuery(params.get('tab')));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { data, client, refresh, addMessage } = useRoomData(contractId);

  const status = (data.detail?.contract.status as ContractStatus | undefined) ?? initialStatus;
  const working = WORKING.has(status);
  const deadline = data.detail?.current_version?.deadline ?? initialDeadline;
  const topupUnpaid = data.steering.some((s) => s.status === 'approved' && (s.topup_status === 'pending' || s.topup_status === 'expired'));
  const paused = data.detail?.work_paused
    ? topupUnpaid
      ? 'Work is paused until the top-up is paid.'
      : 'Work is paused until the scope change is agreed.'
    : null;

  // On narrow screens the tab strip scrolls sideways: keep the selected tab in view (the page itself doesn't move).
  useEffect(() => {
    const tab = tabRefs.current[ROOM_TABS.findIndex((t) => t.id === selected)];
    const strip = tab?.parentElement;
    if (!tab || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = Math.max(0, tab.offsetLeft - strip.offsetLeft - (strip.clientWidth - tab.clientWidth) / 2);
  }, [selected]);

  function select(id: RoomTabId) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState(window.history.state, '', url);
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ROOM_TABS.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(ROOM_TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  function panel(id: RoomTabId): ReactNode {
    switch (id) {
      case 'plan':
        return <PlanTab plan={plan} detail={data.detail} />;
      case 'status':
        return <StatusTab status={status} hint={STATUS_HINT[status]} deadline={deadline} paused={paused} />;
      case 'activity':
        return (
          <ActivityTab
            events={data.activity}
            viewer={role}
            canPost={role === 'provider' && working}
            client={client}
            contractId={contractId}
            onChanged={refresh}
          />
        );
      case 'artifacts':
        return <ArtifactsTab qa={data.qa} />;
      case 'milestones':
        return (
          <MilestonesTab
            milestones={data.milestones}
            canEdit={role === 'provider' && working}
            client={client}
            contractId={contractId}
            onChanged={refresh}
          />
        );
      case 'messages':
        return <MessagesTab messages={data.messages} viewer={role} client={client} contractId={contractId} onSent={addMessage} />;
      case 'steering':
        return (
          <SteeringTab
            steering={data.steering}
            credits={data.detail?.steering_credits ?? null}
            client={client}
            contractId={contractId}
            viewer={role}
            versions={data.detail?.versions ?? []}
            allowance={data.detail?.steering_credits.allowance ?? 0}
            working={working}
            onChanged={refresh}
          />
        );
      case 'qa':
        return <QaTab qa={data.qa} />;
      case 'delivery':
        return (
          <DeliverySlot
            panel={deliveryPanel}
            contractId={contractId}
            role={role}
            contractStatus={status}
            onChanged={() => void refresh()}
          />
        );
    }
  }

  return (
    <section className="gigs-section room" aria-labelledby="room-title" data-slot="job-room">
      <h2 id="room-title" className="gigs-section-title">
        Job room
      </h2>
      {paused ? (
        <p role="status" className="gigs-notice gigs-notice-warning room-paused">
          {paused}
        </p>
      ) : null}
      {data.error ? (
        <p role="alert" className="gigs-notice gigs-notice-danger">
          {`The job room could not be updated: ${data.error}`}
        </p>
      ) : null}
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
            onClick={() => select(t.id)}
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
