/**
 * Email notifications (server-only). Other tracks call:
 *
 *   import { enqueue } from '@/src/lib/notify';
 *   await enqueue(userId, 'bid_received', { jobId, jobTitle, bidderName, amountCents }, `bid_received:${bidId}`);
 */
export { enqueue, dispatchQueued, syncContactFromClerk, deleteContact, getNotifyStore, getNotifier } from './notify.ts';
export { createNotifier, unsubscribeUrl } from './notifier.ts';
export type { Notifier, NotifierDeps, EnqueueResult, DeliverResult, DispatchSummary } from './notifier.ts';
export { NOTIFICATION_TYPES, NOTIFICATION_LABELS, payloadSchemas, isNotificationType } from './types.ts';
export type { NotificationType, Payload, PayloadInput, Contact, NotificationRow, NotificationStatus } from './types.ts';
export type { NotifyStore } from './store.ts';
export type { EmailTransport, EmailMessage } from './transport.ts';
export { MemoryTransport } from './transport.ts';
export { MemoryNotifyStore } from './memory-store.ts';
export { appUrl } from './urls.ts';
