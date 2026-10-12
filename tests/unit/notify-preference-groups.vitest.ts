import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES } from '@/src/lib/notify/types';
import { PREFERENCE_GROUPS, PREFERENCE_LABELS, groupPreferences } from '@/src/lib/notify/preference-groups';

describe('PREFERENCE_GROUPS', () => {
  it('puts every notification type in exactly one group', () => {
    const grouped = PREFERENCE_GROUPS.flatMap((g) => g.types);
    expect([...grouped].sort()).toEqual([...NOTIFICATION_TYPES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('groups are Gigs, Payments, QA, Account, in that order', () => {
    expect(PREFERENCE_GROUPS.map((g) => g.title)).toEqual(['Gigs', 'Payments', 'QA', 'Account']);
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
    expect(groups.map((g) => g.id)).toEqual(['gigs', 'payments', 'qa', 'account']);
    const all = groups.flatMap((g) => g.items);
    expect(all).toHaveLength(NOTIFICATION_TYPES.length);
    expect(all.find((i) => i.type === 'bid_received')).toEqual({ type: 'bid_received', label: PREFERENCE_LABELS.bid_received, emailEnabled: false });
    expect(all.find((i) => i.type === 'payout_sent')?.emailEnabled).toBe(false);
    expect(all.filter((i) => i.emailEnabled)).toHaveLength(NOTIFICATION_TYPES.length - 2);
  });

  it('ignores types it does not know', () => {
    const all = groupPreferences([{ type: 'newsletter', emailEnabled: false }]).flatMap((g) => g.items);
    expect(all.map((i) => i.type)).not.toContain('newsletter');
    expect(all.every((i) => i.emailEnabled)).toBe(true);
  });

  it('keeps the group order of PREFERENCE_GROUPS inside each group', () => {
    const groups = groupPreferences([]);
    for (const g of groups) expect(g.items.map((i) => i.type)).toEqual(PREFERENCE_GROUPS.find((x) => x.id === g.id)!.types);
  });
});
