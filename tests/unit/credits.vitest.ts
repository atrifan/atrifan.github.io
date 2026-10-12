import { describe, expect, it } from 'vitest';
import {
  CREDIT_VALUE_USD,
  MAX_TOP_UP_USD,
  MIN_TOP_UP_USD,
  TOP_UP_PRESETS_USD,
  balanceCredits,
  checkoutReturnUrls,
  creditsForUsd,
  validateTopUp,
} from '@/src/lib/credits';
import { formatCredits, formatDate, formatMoneyCents, formatSignedCredits, formatUsd } from '@/src/lib/format';

describe('credit conversion', () => {
  it('1 credit is $0.01', () => {
    expect(CREDIT_VALUE_USD).toBe(0.01);
    expect(creditsForUsd(5)).toBe(500);
    expect(creditsForUsd(0.01)).toBe(1);
  });

  it('ignores float noise and rounds to the nearest credit', () => {
    expect(creditsForUsd(0.07)).toBe(7); // 0.07 / 0.01 = 7.000000000000001
    expect(creditsForUsd(12.344)).toBe(1234);
    expect(creditsForUsd(12.346)).toBe(1235);
    expect(creditsForUsd(-1.5)).toBe(-150);
    expect(creditsForUsd(0)).toBe(0);
  });

  it('uses a custom credit value', () => {
    expect(creditsForUsd(1, 0.02)).toBe(50);
    expect(balanceCredits(1, 0.02)).toBe(50);
  });

  it('a balance is never overstated: it rounds down', () => {
    expect(balanceCredits(12.34)).toBe(1234);
    expect(balanceCredits(12.3499)).toBe(1234);
    expect(balanceCredits(0.29)).toBe(29); // 0.29 / 0.01 = 28.999999999999996
    expect(balanceCredits(0)).toBe(0);
    expect(balanceCredits(Number.NaN)).toBe(0);
    expect(balanceCredits(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('validateTopUp', () => {
  it('presets are $5, $10 and $25, and all valid', () => {
    expect([...TOP_UP_PRESETS_USD]).toEqual([5, 10, 25]);
    for (const p of TOP_UP_PRESETS_USD) expect(validateTopUp(p)).toEqual({ ok: true, amountUsd: p, credits: p * 100 });
  });

  it('accepts whole dollars from $5 to $500', () => {
    expect(MIN_TOP_UP_USD).toBe(5);
    expect(MAX_TOP_UP_USD).toBe(500);
    expect(validateTopUp(5)).toEqual({ ok: true, amountUsd: 5, credits: 500 });
    expect(validateTopUp(500)).toEqual({ ok: true, amountUsd: 500, credits: 50_000 });
    expect(validateTopUp(7)).toEqual({ ok: true, amountUsd: 7, credits: 700 });
  });

  it('rejects below the minimum', () => {
    expect(validateTopUp(4)).toEqual({ ok: false, error: 'The minimum top-up is $5.' });
    expect(validateTopUp(0)).toEqual({ ok: false, error: 'The minimum top-up is $5.' });
    expect(validateTopUp(-10)).toEqual({ ok: false, error: 'The minimum top-up is $5.' });
  });

  it('rejects above the maximum', () => {
    expect(validateTopUp(501)).toEqual({ ok: false, error: 'The maximum top-up is $500.' });
  });

  it('rejects fractions and non-numbers', () => {
    const whole = { ok: false, error: 'Enter a whole number of dollars.' };
    expect(validateTopUp(5.5)).toEqual(whole);
    expect(validateTopUp('10')).toEqual(whole);
    expect(validateTopUp(Number.NaN)).toEqual(whole);
    expect(validateTopUp(Number.POSITIVE_INFINITY)).toEqual(whole);
    expect(validateTopUp(null)).toEqual(whole);
    expect(validateTopUp(undefined)).toEqual(whole);
  });
});

describe('checkoutReturnUrls', () => {
  it('returns to hub /credits on the root domain', () => {
    expect(checkoutReturnUrls({ NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', NEXT_PUBLIC_APP_URL: 'https://ignored.test' })).toEqual({
      successUrl: 'https://tulzo.online/credits?topup=success',
      cancelUrl: 'https://tulzo.online/credits?topup=canceled',
    });
  });

  it('falls back to NEXT_PUBLIC_APP_URL, then NEXT_PUBLIC_URL, then localhost', () => {
    expect(checkoutReturnUrls({ NEXT_PUBLIC_APP_URL: 'https://preview.test/' }).successUrl).toBe(
      'https://preview.test/credits?topup=success',
    );
    expect(checkoutReturnUrls({ NEXT_PUBLIC_APP_URL: 'https://p.test//' }).successUrl).toBe('https://p.test/credits?topup=success');
    expect(checkoutReturnUrls({ NEXT_PUBLIC_URL: 'https://u.test' }).cancelUrl).toBe('https://u.test/credits?topup=canceled');
    expect(checkoutReturnUrls({}).successUrl).toBe('http://localhost:3000/credits?topup=success');
    expect(checkoutReturnUrls({ NEXT_PUBLIC_ROOT_DOMAIN: '  ' }).successUrl).toBe('http://localhost:3000/credits?topup=success');
  });
});

describe('formatting', () => {
  it('formats credits with grouping and the right noun', () => {
    expect(formatCredits(1234)).toBe('1,234 credits');
    expect(formatCredits(1)).toBe('1 credit');
    expect(formatCredits(0)).toBe('0 credits');
    expect(formatCredits(-1)).toBe('-1 credits');
    expect(formatCredits(1234.6)).toBe('1,235 credits');
    expect(formatSignedCredits(20.4)).toBe('+20');
  });

  it('formats signed credit changes', () => {
    expect(formatSignedCredits(1500)).toBe('+1,500');
    expect(formatSignedCredits(-20)).toBe('-20');
    expect(formatSignedCredits(0)).toBe('0');
  });

  it('formats dollars', () => {
    expect(formatUsd(12.34)).toBe('$12.34');
    expect(formatUsd(15)).toBe('$15.00');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(-1)).toBe('-$1.00');
  });

  it('formats money in cents with its currency', () => {
    expect(formatMoneyCents(30000, 'eur')).toBe('€300.00');
    expect(formatMoneyCents(4500, 'EUR')).toBe('€45.00');
    expect(formatMoneyCents(199, 'usd')).toBe('$1.99');
    expect(formatMoneyCents(null, 'eur')).toBe('—');
    expect(formatMoneyCents(100, null)).toBe('€1.00');
  });

  it('formats dates in UTC as day month year', () => {
    expect(formatDate('2026-10-01T10:00:00Z')).toBe('1 Oct 2026');
    expect(formatDate('2026-10-01T23:30:00-05:00')).toBe('2 Oct 2026');
    expect(formatDate('2026-03-09T00:00:00Z')).toBe('9 Mar 2026');
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });
});
