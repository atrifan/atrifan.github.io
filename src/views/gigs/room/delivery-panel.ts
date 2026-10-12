/**
 * The Delivery panel the job room mounts: Phase 5's DeliveryPanel (download of the QA'd commit,
 * push, accept, dispute and review), loaded on the client only when the Delivery tab opens.
 * The standalone `/contracts/[id]/delivery` page renders the same panel (email deep links).
 */
import dynamic from 'next/dynamic';
import type { DeliveryPanelComponent } from './DeliverySlot';

export const deliveryPanel: DeliveryPanelComponent | undefined = dynamic(
  () => import('@/src/views/gigs/delivery/DeliveryPanel').then((m) => m.RoomDeliveryPanel),
  { ssr: false },
);
