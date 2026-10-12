import { describe, expect, it } from 'vitest';
import {
  AUTO_ACCEPT_REMINDER_HOURS,
  autoAcceptAtFrom,
  autoAcceptDaysFrom,
  claimDaysFrom,
  planAutoAccept,
  reminderDueAt,
  type AutoAcceptCandidate,
} from '@/src/lib/delivery/auto-accept';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const HOUR = 3600_000;
const at = (offsetHours: number) => new Date(NOW.getTime() + offsetHours * HOUR).toISOString();

const due: AutoAcceptCandidate = {
  contractId: 'c1',
  contractStatus: 'delivered',
  autoAcceptAt: at(-1),
  remindedAt: null,
  hasOpenDispute: false,
  paymentSucceeded: true,
};

describe('planAutoAccept', () => {
  it('accepts once the clock has run out', () => {
    expect(planAutoAccept(due, NOW)).toEqual({ contractId: 'c1', action: 'accept' });
    expect(planAutoAccept({ ...due, autoAcceptAt: at(0) }, NOW)).toEqual({ contractId: 'c1', action: 'accept' });
  });

  it('reminds 48 hours before, once', () => {
    expect(AUTO_ACCEPT_REMINDER_HOURS).toBe(48);
    const soon = { ...due, autoAcceptAt: at(47) };
    expect(planAutoAccept(soon, NOW)).toEqual({ contractId: 'c1', action: 'remind', autoAcceptAt: at(47) });
    expect(planAutoAccept({ ...due, autoAcceptAt: at(48) }, NOW)).toEqual({ contractId: 'c1', action: 'remind', autoAcceptAt: at(48) });
    expect(planAutoAccept({ ...soon, remindedAt: at(-1) }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'already_reminded' });
  });

  it('waits when the reminder is not due yet', () => {
    expect(planAutoAccept({ ...due, autoAcceptAt: at(49) }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'not_due' });
  });

  it('honours a custom reminder lead time', () => {
    expect(planAutoAccept({ ...due, autoAcceptAt: at(20) }, NOW, { reminderHours: 24 }).action).toBe('remind');
    expect(planAutoAccept({ ...due, autoAcceptAt: at(25) }, NOW, { reminderHours: 24 }).action).toBe('skip');
  });

  it('accepts even if the reminder was never sent', () => {
    expect(planAutoAccept({ ...due, remindedAt: null, autoAcceptAt: at(-100) }, NOW).action).toBe('accept');
  });

  it('a dispute pauses the clock', () => {
    expect(planAutoAccept({ ...due, hasOpenDispute: true }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'disputed' });
    expect(planAutoAccept({ ...due, contractStatus: 'disputed' }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'disputed' });
  });

  it('only delivered, paid contracts with a clock are accepted', () => {
    expect(planAutoAccept({ ...due, contractStatus: 'in_qa' }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'not_delivered' });
    expect(planAutoAccept({ ...due, contractStatus: 'completed' }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'not_delivered' });
    expect(planAutoAccept({ ...due, autoAcceptAt: null }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'no_clock' });
    expect(planAutoAccept({ ...due, autoAcceptAt: 'not a date' }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'no_clock' });
    expect(planAutoAccept({ ...due, paymentSucceeded: false }, NOW)).toEqual({ contractId: 'c1', action: 'skip', reason: 'unpaid' });
  });
});

describe('clock helpers', () => {
  it('auto-accept is N days after delivery unlocked', () => {
    expect(autoAcceptAtFrom('2026-10-12T10:00:00.000Z', 7)).toBe('2026-10-19T10:00:00.000Z');
  });

  it('the reminder is due 48h before', () => {
    expect(reminderDueAt('2026-10-19T10:00:00.000Z')).toBe('2026-10-17T10:00:00.000Z');
    expect(reminderDueAt('2026-10-19T10:00:00.000Z', 24)).toBe('2026-10-18T10:00:00.000Z');
  });

  it('reads JOBS_AUTO_ACCEPT_DAYS and JOBS_POST_ACCEPT_CLAIM_DAYS with defaults 7 and 14', () => {
    expect(autoAcceptDaysFrom({})).toBe(7);
    expect(autoAcceptDaysFrom({ JOBS_AUTO_ACCEPT_DAYS: ' 3 ' })).toBe(3);
    expect(claimDaysFrom({})).toBe(14);
    expect(claimDaysFrom({ JOBS_POST_ACCEPT_CLAIM_DAYS: '30' })).toBe(30);
    expect(claimDaysFrom({ JOBS_POST_ACCEPT_CLAIM_DAYS: '' })).toBe(14);
    expect(claimDaysFrom({ JOBS_POST_ACCEPT_CLAIM_DAYS: '   ' })).toBe(14);
    expect(autoAcceptDaysFrom({ JOBS_AUTO_ACCEPT_DAYS: '1' })).toBe(1);
    expect(() => claimDaysFrom({ JOBS_POST_ACCEPT_CLAIM_DAYS: '0' })).toThrow('JOBS_POST_ACCEPT_CLAIM_DAYS must be a whole number >= 1, got "0"');
    for (const bad of ['0', '-1', '2.5', 'abc']) {
      expect(() => claimDaysFrom({ JOBS_POST_ACCEPT_CLAIM_DAYS: bad })).toThrow(RangeError);
      expect(() => autoAcceptDaysFrom({ JOBS_AUTO_ACCEPT_DAYS: bad })).toThrow(RangeError);
    }
  });
});
