import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES } from '@/src/lib/notify/types';
import { PREFERENCE_GROUPS, PREFERENCE_LABELS, groupPreferences, groupTypes } from '@/src/lib/notify/preference-groups';

describe('PREFERENCE_GROUPS', () => {
  it('puts every notification type in exactly one group', () => {
    const grouped = PREFERENCE_GROUPS.flatMap((g) => g.types);
    expect([...grouped].sort()).toEqual([...NOTIFICATION_TYPES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('groups are Gigs, Payments, QA, Account, Marketplace, Admin, in that order', () => {
    expect(PREFERENCE_GROUPS.map((g) => g.title)).toEqual(['Gigs', 'Payments', 'QA', 'Account', 'Marketplace', 'Admin']);
    expect(groupTypes('marketplace')).toEqual(['package_installed', 'package_approved', 'package_rejected']);
    expect(groupTypes('admin')).toEqual(['submission_awaiting_qa', 'support_complaint_received', 'support_email_received']);
    expect(groupTypes('nope')).toEqual([]);
  });

  it('every type has a friendly label, all different', () => {
    const labels = NOTIFICATION_TYPES.map((t) => PREFERENCE_LABELS[t]);
    expect(labels.every((l) => typeof l === 'string' && l.length > 3)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('groupPreferences', () => {
  it('every type, grouped, with the saved switch state; missing types default to on', () => {
    const groups = groupPreferences([
      { type: 'bid_received', emailEnabled: false },
      { type: 'payout_sent', emailEnabled: false },
    ]);
    expect(groups.map((g) => g.id)).toEqual(['gigs', 'payments', 'qa', 'account', 'marketplace', 'admin']);
    const all = groups.flatMap((g) => g.items);
    expect(all).toHaveLength(NOTIFICATION_TYPES.length);
    expect(all.find((i) => i.type === 'bid_received')).toEqual({ type: 'bid_received', label: PREFERENCE_LABELS.bid_received, emailEnabled: false });
    expect(all.find((i) => i.type === 'payout_sent')?.emailEnabled).toBe(false);
    // package_installed is the one email that is off unless switched on
    expect(all.find((i) => i.type === 'package_installed')?.emailEnabled).toBe(false);
    // plus the two support notices (admins get the forwarded email instead)
    expect(all.filter((i) => i.emailEnabled)).toHaveLength(NOTIFICATION_TYPES.length - 5);
  });

  it('ignores types it does not know', () => {
    const all = groupPreferences([{ type: 'newsletter', emailEnabled: false }]).flatMap((g) => g.items);
    expect(all.map((i) => i.type)).not.toContain('newsletter');
    expect(all.filter((i) => !i.emailEnabled).map((i) => i.type)).toEqual(['package_installed', 'support_complaint_received', 'support_email_received']);
  });

  it('a group is in-app on unless every type in it was switched off', () => {
    const groups = groupPreferences([
      { type: 'payment_confirmed', emailEnabled: true, inAppEnabled: false },
      ...['submission_received', 'qa_verdict'].map((type) => ({ type, emailEnabled: true, inAppEnabled: false })),
    ]);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g.inAppEnabled]));
    expect(byId).toEqual({ gigs: true, payments: true, qa: false, account: true, marketplace: true, admin: true });
    expect(groupPreferences([]).every((g) => g.inAppEnabled)).toBe(true);
  });

  it('keeps the group order of PREFERENCE_GROUPS inside each group', () => {
    const groups = groupPreferences([]);
    for (const g of groups) expect(g.items.map((i) => i.type)).toEqual(PREFERENCE_GROUPS.find((x) => x.id === g.id)!.types);
  });
});
