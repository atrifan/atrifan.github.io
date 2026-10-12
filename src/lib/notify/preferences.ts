import { NOTIFICATION_TYPES, type Contact, type NotificationType, type PreferenceRow } from './types.ts';

export type SkipReason = 'no_contact' | 'no_email' | 'email_unverified' | 'unsubscribed';
export type GateDecision = { send: true } | { send: false; reason: SkipReason };

/** Types whose email is off until the user switches it on (high-volume, the bell covers them). */
export const EMAIL_OFF_BY_DEFAULT: readonly NotificationType[] = ['package_installed'];

/** Email: every type is on by default except EMAIL_OFF_BY_DEFAULT; a stored choice overrides it. */
export function resolvePreferences(rows: PreferenceRow[]): Record<NotificationType, boolean> {
  const out = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, !EMAIL_OFF_BY_DEFAULT.includes(t)])) as Record<NotificationType, boolean>;
  for (const row of rows) {
    if (row.type in out && typeof row.emailEnabled === 'boolean') out[row.type] = row.emailEnabled;
  }
  return out;
}

/** In-app: every type is on by default; a stored choice overrides it. */
export function resolveInAppPreferences(rows: PreferenceRow[]): Record<NotificationType, boolean> {
  const out = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true])) as Record<NotificationType, boolean>;
  for (const row of rows) {
    if (row.type in out && typeof row.inAppEnabled === 'boolean') out[row.type] = row.inAppEnabled;
  }
  return out;
}

/** Whether to write the in-app item. Unlike email it needs no contact or verified address. */
export function gateInApp(rows: PreferenceRow[], type: NotificationType): boolean {
  return resolveInAppPreferences(rows)[type];
}

export function gateNotification(contact: Contact | null, rows: PreferenceRow[], type: NotificationType): GateDecision {
  if (!contact) return { send: false, reason: 'no_contact' };
  if (!contact.email) return { send: false, reason: 'no_email' };
  if (!contact.emailVerified) return { send: false, reason: 'email_unverified' };
  if (!resolvePreferences(rows)[type]) return { send: false, reason: 'unsubscribed' };
  return { send: true };
}
