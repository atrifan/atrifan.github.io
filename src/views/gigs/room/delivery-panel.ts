/**
 * The Delivery panel the job room mounts. Phase 5 builds src/views/gigs/delivery/DeliveryPanel;
 * until it is merged this is undefined and the room's Delivery tab shows a placeholder. After
 * the merge, replace the export with (see ./DeliverySlot.tsx for the props it receives):
 *
 *   import dynamic from 'next/dynamic';
 *   export const deliveryPanel: DeliveryPanelComponent | undefined = dynamic(
 *     () => import('@/src/views/gigs/delivery/DeliveryPanel').then((m) => m.DeliveryPanel),
 *     { ssr: false },
 *   );
 */
import type { DeliveryPanelComponent } from './DeliverySlot';

export const deliveryPanel: DeliveryPanelComponent | undefined = undefined;
