import { describe, expect, it } from 'vitest';
import { pluralize } from '@/src/lib/format';

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'payout')).toBe('1 payout');
    expect(pluralize(1, 'refund')).toBe('1 refund');
  });

  it('adds an s for zero, many and fractions', () => {
    expect(pluralize(0, 'payment')).toBe('0 payments');
    expect(pluralize(2, 'payment')).toBe('2 payments');
    expect(pluralize(1.5, 'day')).toBe('1.5 days');
  });

  it('takes an irregular plural', () => {
    expect(pluralize(1, 'reply', 'replies')).toBe('1 reply');
    expect(pluralize(3, 'reply', 'replies')).toBe('3 replies');
  });

  it('groups thousands', () => {
    expect(pluralize(12345, 'job')).toBe('12,345 jobs');
  });
});
