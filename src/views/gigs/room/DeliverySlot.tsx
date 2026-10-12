/**
 * The job room's Delivery tab is a slot. ./delivery-panel.ts mounts Phase 5's DeliveryPanel
 * (src/views/gigs/delivery/DeliveryPanel, `RoomDeliveryPanel`) in it; a caller can also pass
 * `deliveryPanel` to <JobRoom> directly. Without a panel the slot shows a placeholder.
 */
import type { ComponentType } from 'react';
import type { PartyRole } from '@/src/lib/jobs/client/room';

/** What the Delivery panel gets from the room. */
export interface DeliveryPanelProps {
  contractId: string;
  role: PartyRole;
  /** contracts.status, e.g. 'delivered' once QA validated the work. */
  contractStatus: string;
  /** Ask the room to reload the contract, feeds and QA (after accept, dispute, review). */
  onChanged: () => void;
}

export type DeliveryPanelComponent = ComponentType<DeliveryPanelProps>;

const DELIVERABLE = new Set(['delivered', 'completed']);

/**
 * With a mounted panel, `[data-slot="delivery"]` is always there: the panel says when the
 * delivery unlocks, and a dispute can be opened while the work is still in progress. Without
 * a panel the slot appears once QA validated the work.
 */
export function DeliverySlot({ panel: Panel, ...props }: DeliveryPanelProps & { panel?: DeliveryPanelComponent }) {
  if (Panel) {
    return (
      <div data-slot="delivery" className="room-delivery">
        <Panel {...props} />
      </div>
    );
  }
  if (!DELIVERABLE.has(props.contractStatus)) {
    return (
      <p className="gigs-hint room-empty">
        The delivery appears here once QA validates the work: a download of the reviewed commit, and accepting or disputing it.
      </p>
    );
  }
  return (
    <div data-slot="delivery" className="room-delivery room-card">
      <p className="room-h">QA validated the work.</p>
      <p className="gigs-hint">The delivery of the reviewed commit, acceptance and disputes open here.</p>
    </div>
  );
}
