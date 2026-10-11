import { NOTIFICATION_TYPES, type Contact, type NotificationType, type PreferenceRow } from './types.ts';

export type SkipReason = 'no_contact' | 'no_email' | 'email_unverified' | 'unsubscribed';
export type GateDecision = { send: true } | { send: false; reason: SkipReason };

/** Every type is on by default; a stored row overrides it. */
export function resolvePreferences(rows: PreferenceRow[]): Record<NotificationType, boolean> {
  const out = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true])) as Record<NotificationType, boolean>;
  for (const row of rows) {
    if (row.type in out) out[row.type] = row.emailEnabled;
  }
  return out;
}

export function gateNotification(contact: Contact | null, rows: PreferenceRow[], type: NotificationType): GateDecision {
  if (!contact) return { send: false, reason: 'no_contact' };
  if (!contact.email) return { send: false, reason: 'no_email' };
  if (!contact.emailVerified) return { send: false, reason: 'email_unverified' };
  if (!resolvePreferences(rows)[type]) return { send: false, reason: 'unsubscribed' };
  return { send: true };
}
