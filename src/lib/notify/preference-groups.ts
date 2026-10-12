/**
 * How hub /profile shows the email switches: every notification type, in four groups, with
 * labels written for the settings page (the email templates use NOTIFICATION_LABELS). Pure.
 */
import { isNotificationType, type NotificationType } from './types';

export type PreferenceGroupId = 'gigs' | 'payments' | 'qa' | 'account';

export const PREFERENCE_GROUPS: ReadonlyArray<{ id: PreferenceGroupId; title: string; types: NotificationType[] }> = [
  {
    id: 'gigs',
    title: 'Gigs',
    types: [
      'job_posted',
      'bid_received',
      'bid_accepted',
      'contract_created',
      'progress_update',
      'milestone_completed',
      'steering_awaiting_approval',
      'scope_change_awaiting_approval',
      'delivery_ready',
      'auto_accept_reminder',
    ],
  },
  { id: 'payments', title: 'Payments', types: ['payment_confirmed', 'payout_sent', 'dispute_opened', 'dispute_resolved'] },
  { id: 'qa', title: 'QA', types: ['submission_received', 'qa_verdict'] },
  { id: 'account', title: 'Account', types: ['review_received', 'review_requested'] },
];

export const PREFERENCE_LABELS: Record<NotificationType, string> = {
  job_posted: 'Your job is posted',
  bid_received: 'New bids on your jobs',
  bid_accepted: 'Your bid is accepted',
  contract_created: 'A contract starts',
  progress_update: 'Progress updates from your provider',
  milestone_completed: 'Milestones completed',
  steering_awaiting_approval: 'Questions and change requests to answer',
  scope_change_awaiting_approval: 'Scope changes to approve',
  delivery_ready: 'Delivery ready to review',
  auto_accept_reminder: 'Reminder before a delivery auto-accepts',
  payment_confirmed: 'Payment confirmed',
  payout_sent: 'Payout sent to you',
  dispute_opened: 'A dispute is opened',
  dispute_resolved: 'A dispute is resolved',
  submission_received: 'Work submitted for QA',
  qa_verdict: 'QA verdicts',
  review_received: 'Someone reviewed you',
  review_requested: 'Reminders to leave a review',
};

export interface PreferenceItem {
  type: NotificationType;
  label: string;
  emailEnabled: boolean;
}

/** Every type in its group; a type the server didn't send is on (the default). */
export function groupPreferences(prefs: ReadonlyArray<{ type: string; emailEnabled: boolean }>): Array<{ id: PreferenceGroupId; title: string; items: PreferenceItem[] }> {
  const saved = new Map<NotificationType, boolean>();
  for (const p of prefs) if (isNotificationType(p.type)) saved.set(p.type, p.emailEnabled);
  return PREFERENCE_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    items: g.types.map((type) => ({ type, label: PREFERENCE_LABELS[type], emailEnabled: saved.get(type) ?? true })),
  }));
}
