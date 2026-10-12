/**
 * How hub /profile shows the notification switches: every notification type, in groups, with
 * labels written for the settings page (the email templates use NOTIFICATION_LABELS). Email is
 * one switch per type; in-app is one switch per group. Pure.
 */
import { EMAIL_OFF_BY_DEFAULT } from './preferences';
import type { NotificationType } from './types';

export type PreferenceGroupId = 'gigs' | 'payments' | 'qa' | 'account' | 'marketplace' | 'admin';

/** `adminOnly` groups are shown to, and changeable by, admins only (src/lib/admin.ts). */
export const PREFERENCE_GROUPS: ReadonlyArray<{ id: PreferenceGroupId; title: string; types: NotificationType[]; adminOnly?: true }> = [
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
  { id: 'marketplace', title: 'Marketplace', types: ['package_installed', 'package_approved', 'package_rejected'] },
  { id: 'admin', title: 'Admin', types: ['submission_awaiting_qa', 'support_complaint_received', 'support_email_received'], adminOnly: true },
];

/** Types in admin-only groups. */
export const ADMIN_ONLY_TYPES: readonly NotificationType[] = PREFERENCE_GROUPS.filter((g) => g.adminOnly).flatMap((g) => g.types);

export function isAdminOnlyType(type: string): boolean {
  return (ADMIN_ONLY_TYPES as readonly string[]).includes(type);
}

export function isAdminOnlyGroup(id: string): boolean {
  return PREFERENCE_GROUPS.some((g) => g.id === id && g.adminOnly === true);
}

/** The types in a group (empty for an unknown id). */
export function groupTypes(id: string): NotificationType[] {
  return [...(PREFERENCE_GROUPS.find((g) => g.id === id)?.types ?? [])];
}

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
  package_installed: 'Someone installed your package',
  package_approved: 'Your package is approved',
  package_rejected: "Your package wasn't approved",
  submission_awaiting_qa: 'Submissions waiting in the QA queue',
  support_complaint_received: 'A complaint arrives through the form',
  support_email_received: 'An email arrives at the support address',
};

export interface PreferenceItem {
  type: NotificationType;
  label: string;
  emailEnabled: boolean;
}

export interface PreferenceGroupView {
  id: PreferenceGroupId;
  title: string;
  /** On unless every type in the group was switched off in-app. */
  inAppEnabled: boolean;
  items: PreferenceItem[];
}

type SavedPreference = { type: string; emailEnabled?: boolean | null; inAppEnabled?: boolean | null };

/** Every type in its group; a type the server didn't send gets its default. Admin-only groups only for admins. */
export function groupPreferences(prefs: ReadonlyArray<SavedPreference>, { admin = true }: { admin?: boolean } = {}): PreferenceGroupView[] {
  // Unknown types are never looked up; a null/absent choice falls back to the default below.
  const email = new Map(prefs.map((p) => [p.type, p.emailEnabled]));
  const inApp = new Map(prefs.map((p) => [p.type, p.inAppEnabled]));
  return PREFERENCE_GROUPS.filter((g) => admin || !g.adminOnly).map((g) => ({
    id: g.id,
    title: g.title,
    inAppEnabled: g.types.some((type) => inApp.get(type) ?? true),
    items: g.types.map((type) => ({ type, label: PREFERENCE_LABELS[type], emailEnabled: email.get(type) ?? !EMAIL_OFF_BY_DEFAULT.includes(type) })),
  }));
}
