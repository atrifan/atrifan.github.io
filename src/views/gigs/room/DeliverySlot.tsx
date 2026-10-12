/**
 * The job room's Delivery tab is a slot. Phase 5 (delivery, acceptance, disputes, reviews)
 * builds `src/views/gigs/delivery/DeliveryPanel`; until it is merged the slot shows a
 * placeholder. To mount it, set `deliveryPanel` in ./delivery-panel.ts:
 *
 *   import dynamic from 'next/dynamic';
 *   export const deliveryPanel: DeliveryPanelComponent = dynamic(
 *     () => import('@/src/views/gigs/delivery/DeliveryPanel').then((m) => m.DeliveryPanel),
 *     { ssr: false },
 *   );
 *
 * or pass `deliveryPanel` to <JobRoom> directly.
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
 * `[data-slot="delivery"]` is present when there is something to deliver (QA validated the
 * work) or a mounted panel; before that the tab only says what will appear here.
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
