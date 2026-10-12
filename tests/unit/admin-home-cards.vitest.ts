import { describe, expect, it } from 'vitest';
import { adminHomeCards, settledNumber, UNAVAILABLE, type AdminHomeNumbers } from '@/src/lib/admin-home/cards';

const LINKS = { qa: '/q', disputes: '/d', inbox: '/i', moderation: '/m', activity: '/a' };
const NUMBERS: AdminHomeNumbers = { awaitingQa: 2, openDisputes: 0, openThreads: 3, pendingPackages: 1, commissionCents30d: 9000 };

const byArea = (numbers: AdminHomeNumbers) => Object.fromEntries(adminHomeCards(numbers, LINKS).map((c) => [c.area, c]));

describe('adminHomeCards', () => {
  it('has one card per area, in order, with its title and link', () => {
    expect(adminHomeCards(NUMBERS, LINKS).map((c) => [c.area, c.title, c.href])).toEqual([
      ['qa', 'QA queue', '/q'],
      ['disputes', 'Disputes', '/d'],
      ['inbox', 'Inbox', '/i'],
      ['moderation', 'Marketplace moderation', '/m'],
      ['activity', 'Activity', '/a'],
    ]);
  });

  it('shows the numbers, the commission as money, and captions', () => {
    const c = byArea(NUMBERS);
    expect([c.qa.value, c.qa.caption]).toEqual(['2', 'awaiting QA']);
    expect([c.disputes.value, c.disputes.caption]).toEqual(['0', 'open']);
    expect([c.inbox.value, c.inbox.caption]).toEqual(['3', 'open threads']);
    expect([c.moderation.value, c.moderation.caption]).toEqual(['1', 'pending package']);
    expect([c.activity.value, c.activity.caption]).toEqual(['€90.00', 'commission, last 30 days']);
  });

  it('uses the singular for exactly one and the plural otherwise', () => {
    const one = byArea({ ...NUMBERS, openThreads: 1, pendingPackages: 1 });
    expect([one.inbox.caption, one.moderation.caption]).toEqual(['open thread', 'pending package']);
    const none = byArea({ ...NUMBERS, openThreads: 0, pendingPackages: 0 });
    expect([none.inbox.caption, none.moderation.caption]).toEqual(['open threads', 'pending packages']);
    const many = byArea({ ...NUMBERS, openThreads: 2, pendingPackages: 5 });
    expect([many.inbox.caption, many.moderation.caption]).toEqual(['open threads', 'pending packages']);
  });

  it('flags waiting work on non-zero queues only, never on activity', () => {
    const c = byArea(NUMBERS);
    expect([c.qa.attention, c.disputes.attention, c.inbox.attention, c.moderation.attention, c.activity.attention]).toEqual([
      true,
      false,
      true,
      true,
      false,
    ]);
  });

  it('shows a dash and no flag when a number could not be read', () => {
    const c = byArea({ awaitingQa: null, openDisputes: null, openThreads: null, pendingPackages: null, commissionCents30d: null });
    for (const card of Object.values(c)) {
      expect([card.value, card.caption, card.attention]).toEqual([UNAVAILABLE, 'Couldn’t load', false]);
    }
    expect(UNAVAILABLE).toBe('—');
  });

  it('shows zero commission as €0.00, not as unavailable', () => {
    expect(byArea({ ...NUMBERS, commissionCents30d: 0 }).activity.value).toBe('€0.00');
  });
});

describe('settledNumber', () => {
  it('keeps a fulfilled value (zero included) and turns a rejection into null', () => {
    expect(settledNumber({ status: 'fulfilled', value: 4 })).toBe(4);
    expect(settledNumber({ status: 'fulfilled', value: 0 })).toBe(0);
    expect(settledNumber({ status: 'rejected', reason: new Error('x') })).toBeNull();
  });
});
