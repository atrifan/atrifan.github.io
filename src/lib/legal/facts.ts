/**
 * The numbers and identity the legal pages quote, read from the same env-backed helpers the
 * code uses, so the policy text can't drift from the behaviour. Pure (env in, facts out).
 *
 * Operator identity: the trading name is "Tulzo". The operator's own name, address, country,
 * company and VAT numbers are only shown when their env vars are set; never as placeholders.
 */
import { AUTO_ACCEPT_REMINDER_HOURS, autoAcceptDaysFrom, claimDaysFrom } from '../delivery/auto-accept';
import { commissionBpsFromEnv } from '../jobs/commission';
import { CREDIT_VALUE_USD, MAX_TOP_UP_USD, MIN_TOP_UP_USD } from '../credits';
import { CREDIT_MARKUP } from '../plan-catalog';

/** Bump with every material change to the terms; recorded with each withdrawal consent. */
export const TERMS_VERSION = '1.0';
/** ISO dates (UTC) for the "Effective" and "Last updated" lines. */
export const TERMS_EFFECTIVE_DATE = '2026-10-12';
export const LEGAL_UPDATED_DATE = '2026-10-12';
/** The P2B Regulation (EU) 2019/1150 art. 3(2) minimum notice for business users. */
export const BUSINESS_USER_NOTICE_DAYS = 15;
/** Notice for consumers before changed terms apply. */
export const CONSUMER_NOTICE_DAYS = 30;
/** What we tell complainants about response times. */
export const COMPLAINT_RESPONSE_DAYS = 14;

type Env = Record<string, string | undefined>;

export interface OperatorIdentity {
  /** Trading name, always "Tulzo". */
  tradingName: string;
  /** The person or entity running Tulzo (LEGAL_OPERATOR_NAME). */
  legalName: string | null;
  address: string | null;
  country: string | null;
  companyNo: string | null;
  vatNo: string | null;
}

export interface LegalFacts {
  version: string;
  effectiveDate: string;
  updatedDate: string;
  autoAcceptDays: number;
  claimDays: number;
  reminderHours: number;
  /** e.g. "15%". */
  commissionPercent: string;
  contactEmail: string | null;
  operator: OperatorIdentity;
  minTopUpUsd: number;
  maxTopUpUsd: number;
  creditValueUsd: number;
  /** e.g. "1.3×". */
  usageMarkup: string;
  /** e.g. "30%". */
  usageMarkupPercent: string;
  businessNoticeDays: number;
  consumerNoticeDays: number;
  complaintResponseDays: number;
}

const opt = (env: Env, name: string): string | null => {
  const v = (env[name] ?? '').trim();
  return v ? v : null;
};

/** Percent text for basis points: 1500 → "15%", 1250 → "12.5%". */
export function percentText(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** A simple shape check for the contact address; a bad value is treated as unset. */
export function contactEmailFrom(env: Env): string | null {
  const v = opt(env, 'LEGAL_CONTACT_EMAIL');
  return v && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v : null;
}

export function operatorFrom(env: Env): OperatorIdentity {
  return {
    tradingName: 'Tulzo',
    legalName: opt(env, 'LEGAL_OPERATOR_NAME'),
    address: opt(env, 'LEGAL_OPERATOR_ADDRESS'),
    country: opt(env, 'LEGAL_COUNTRY'),
    companyNo: opt(env, 'LEGAL_COMPANY_NO'),
    vatNo: opt(env, 'LEGAL_VAT_NO'),
  };
}

export function legalFacts(env: Env = process.env): LegalFacts {
  return {
    version: TERMS_VERSION,
    effectiveDate: TERMS_EFFECTIVE_DATE,
    updatedDate: LEGAL_UPDATED_DATE,
    autoAcceptDays: autoAcceptDaysFrom(env),
    claimDays: claimDaysFrom(env),
    reminderHours: AUTO_ACCEPT_REMINDER_HOURS,
    commissionPercent: percentText(commissionBpsFromEnv(env)),
    contactEmail: contactEmailFrom(env),
    operator: operatorFrom(env),
    minTopUpUsd: MIN_TOP_UP_USD,
    maxTopUpUsd: MAX_TOP_UP_USD,
    creditValueUsd: CREDIT_VALUE_USD,
    usageMarkup: `${CREDIT_MARKUP}×`,
    usageMarkupPercent: `${Math.round((CREDIT_MARKUP - 1) * 100)}%`,
    businessNoticeDays: BUSINESS_USER_NOTICE_DAYS,
    consumerNoticeDays: CONSUMER_NOTICE_DAYS,
    complaintResponseDays: COMPLAINT_RESPONSE_DAYS,
  };
}

/** "2026-10-12" → "12 October 2026" (UTC, en-GB). */
export function legalDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** "Gigs: dispute within 7 days of delivery, claim within 14 days of acceptance". */
export function gigsWindowsSummary(f: Pick<LegalFacts, 'autoAcceptDays' | 'claimDays'>): string {
  return `Gigs: dispute within ${days(f.autoAcceptDays)} of delivery, claim within ${days(f.claimDays)} of acceptance`;
}

/** The one-line notice on the gigs accept dialog, contract and delivery pages. */
export function gigsWindowsNotice(f: Pick<LegalFacts, 'autoAcceptDays' | 'claimDays'>): string {
  return `Disputes: until you accept the delivery (automatic after ${days(f.autoAcceptDays)}). Claims: within ${days(f.claimDays)} of acceptance.`;
}

export function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
