import { describe, expect, it } from 'vitest';
import {
  TERMS_VERSION,
  contactEmailFrom,
  days,
  gigsWindowsNotice,
  gigsWindowsSummary,
  legalDate,
  legalFacts,
  operatorFrom,
  percentText,
} from '@/src/lib/legal/facts';
import { CONSENT_PURCHASES, CONSENT_TEXT, hasWithdrawalConsent, isConsentPurchase } from '@/src/lib/legal/consent';
import { constantTimeEqual, e2eIdentity } from '@/src/lib/e2e-identity';

describe('legal facts', () => {
  it('defaults: 7 / 14 days, 48 hours, 15%, no contact, no operator lines', () => {
    const f = legalFacts({});
    expect(f).toMatchObject({
      version: TERMS_VERSION,
      autoAcceptDays: 7,
      claimDays: 14,
      reminderHours: 48,
      commissionPercent: '15%',
      contactEmail: null,
      minTopUpUsd: 5,
      maxTopUpUsd: 500,
      creditValueUsd: 0.01,
      usageMarkup: '1.3×',
      usageMarkupPercent: '30%',
      businessNoticeDays: 15,
      complaintResponseDays: 14,
    });
    expect(f.operator).toEqual({ tradingName: 'Tulzo', legalName: null, address: null, country: null, companyNo: null, vatNo: null });
  });

  it('reads the same env the behaviour reads', () => {
    const f = legalFacts({ JOBS_AUTO_ACCEPT_DAYS: '10', JOBS_POST_ACCEPT_CLAIM_DAYS: '30', MARKETPLACE_COMMISSION_PERCENT: '12.5', LEGAL_CONTACT_EMAIL: 'support@tulzo.online' });
    expect([f.autoAcceptDays, f.claimDays, f.commissionPercent, f.contactEmail]).toEqual([10, 30, '12.5%', 'support@tulzo.online']);
  });

  it('a set-but-invalid day count throws, like the behaviour', () => {
    expect(() => legalFacts({ JOBS_AUTO_ACCEPT_DAYS: '0' })).toThrow(RangeError);
  });

  it('contact email: trimmed; a malformed value counts as unset', () => {
    expect(contactEmailFrom({ LEGAL_CONTACT_EMAIL: ' a@b.co ' })).toBe('a@b.co');
    for (const bad of ['', '  ', 'nope', 'a@b', 'a b@c.co', '<a@b.co>']) expect(contactEmailFrom({ LEGAL_CONTACT_EMAIL: bad }), bad).toBeNull();
  });

  it('operator lines only when set', () => {
    expect(
      operatorFrom({
        LEGAL_OPERATOR_NAME: ' Ada Lovelace ',
        LEGAL_OPERATOR_ADDRESS: '1 Main St',
        LEGAL_COUNTRY: 'Ireland',
        LEGAL_COMPANY_NO: '123',
        LEGAL_VAT_NO: 'IE1',
      }),
    ).toEqual({ tradingName: 'Tulzo', legalName: 'Ada Lovelace', address: '1 Main St', country: 'Ireland', companyNo: '123', vatNo: 'IE1' });
    expect(operatorFrom({ LEGAL_OPERATOR_NAME: '   ' }).legalName).toBeNull();
  });

  it('text helpers', () => {
    expect(percentText(1500)).toBe('15%');
    expect(percentText(1250)).toBe('12.5%');
    expect(percentText(1)).toBe('0.01%');
    expect(days(1)).toBe('1 day');
    expect(days(2)).toBe('2 days');
    expect(legalDate('2026-10-12')).toBe('12 October 2026');
    expect(gigsWindowsSummary({ autoAcceptDays: 7, claimDays: 14 })).toBe('Gigs: dispute within 7 days of delivery, claim within 14 days of acceptance');
    expect(gigsWindowsNotice({ autoAcceptDays: 1, claimDays: 14 })).toBe(
      'Disputes: until you accept the delivery (automatic after 1 day). Claims: within 14 days of acceptance.',
    );
  });
});

describe('withdrawal consent', () => {
  it('only the literal true counts', () => {
    expect(hasWithdrawalConsent({ withdrawal_consent: true })).toBe(true);
    for (const v of [false, 'true', 1, null, undefined]) expect(hasWithdrawalConsent({ withdrawal_consent: v }), String(v)).toBe(false);
    expect(hasWithdrawalConsent(null)).toBe(false);
    expect(hasWithdrawalConsent('withdrawal_consent')).toBe(false);
  });

  it('purchases and their texts', () => {
    expect([...CONSENT_PURCHASES]).toEqual(['credits', 'subscription', 'gig_contract']);
    for (const p of CONSENT_PURCHASES) expect(CONSENT_TEXT[p]).toMatch(/14-day right of withdrawal/);
    expect(isConsentPurchase('credits')).toBe(true);
    expect(isConsentPurchase('refund')).toBe(false);
  });
});

describe('e2e identity (middleware)', () => {
  const secret = 'x'.repeat(16);
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });

  it('accepts the matching secret outside production', () => {
    expect(e2eIdentity(h({ 'x-e2e-user': 'u1', 'x-e2e-secret': secret }), { NODE_ENV: 'development', JOBS_E2E_AUTH_SECRET: secret })).toBe('u1');
  });

  it('never in production, never with a short or missing secret, never on a mismatch', () => {
    const headers = h({ 'x-e2e-user': 'u1', 'x-e2e-secret': secret });
    expect(e2eIdentity(headers, { NODE_ENV: 'production', JOBS_E2E_AUTH_SECRET: secret })).toBeNull();
    expect(e2eIdentity(h({ 'x-e2e-user': 'u1', 'x-e2e-secret': 'short' }), { NODE_ENV: 'test', JOBS_E2E_AUTH_SECRET: 'short' })).toBeNull();
    expect(e2eIdentity(headers, { NODE_ENV: 'test' })).toBeNull();
    expect(e2eIdentity(h({ 'x-e2e-user': 'u1', 'x-e2e-secret': `${secret}y` }), { NODE_ENV: 'test', JOBS_E2E_AUTH_SECRET: secret })).toBeNull();
    expect(e2eIdentity(h({ 'x-e2e-secret': secret }), { NODE_ENV: 'test', JOBS_E2E_AUTH_SECRET: secret })).toBeNull();
    expect(e2eIdentity(h({ 'x-e2e-user': 'u1' }), { NODE_ENV: 'test', JOBS_E2E_AUTH_SECRET: secret })).toBeNull();
  });

  it('constantTimeEqual', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('a', '')).toBe(false);
  });
});
