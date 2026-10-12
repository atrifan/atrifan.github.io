import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  contractStatusLabel,
  deadlineLabel,
  formatBudget,
  formatDate,
  formatEuros,
  jobStatusLabel,
  parseEurosToCents,
  postedAgo,
  GIG_CATEGORIES,
} from '@/src/lib/jobs/client/format';

describe('formatEuros', () => {
  it('shows whole euros without decimals', () => {
    expect(formatEuros(30000)).toBe('€300');
    expect(formatEuros(0)).toBe('€0');
    expect(formatEuros(100)).toBe('€1');
  });

  it('groups thousands', () => {
    expect(formatEuros(125000)).toBe('€1,250');
    expect(formatEuros(500000000)).toBe('€5,000,000');
  });

  it('shows two decimals when there are cents', () => {
    expect(formatEuros(1250)).toBe('€12.50');
    expect(formatEuros(17250)).toBe('€172.50');
    expect(formatEuros(5)).toBe('€0.05');
    expect(formatEuros(123456)).toBe('€1,234.56');
  });

  it('puts the minus sign before the euro sign', () => {
    expect(formatEuros(-500)).toBe('-€5');
    expect(formatEuros(-1250)).toBe('-€12.50');
  });
});

describe('formatBudget', () => {
  it('shows a range with an en dash', () => {
    expect(formatBudget(20000, 40000)).toBe('€200 – €400');
  });
  it('shows one price when min equals max', () => {
    expect(formatBudget(30000, 30000)).toBe('€300');
  });
  it('shows open-ended budgets', () => {
    expect(formatBudget(20000, null)).toBe('From €200');
    expect(formatBudget(null, 40000)).toBe('Up to €400');
    expect(formatBudget(0, null)).toBe('From €0');
    expect(formatBudget(null, 0)).toBe('Up to €0');
  });
  it('says the budget is open when neither is set', () => {
    expect(formatBudget(null, null)).toBe('Budget open');
    expect(formatBudget(undefined, undefined)).toBe('Budget open');
  });
});

describe('parseEurosToCents', () => {
  it('returns null for empty input', () => {
    expect(parseEurosToCents('')).toBeNull();
    expect(parseEurosToCents('   ')).toBeNull();
    expect(parseEurosToCents(undefined)).toBeNull();
  });
  it('parses whole and decimal euros', () => {
    expect(parseEurosToCents('300')).toBe(30000);
    expect(parseEurosToCents(' 12.5 ')).toBe(1250);
    expect(parseEurosToCents('12.05')).toBe(1205);
    expect(parseEurosToCents('0')).toBe(0);
    expect(parseEurosToCents('0.1')).toBe(10);
  });
  it('accepts a decimal comma', () => {
    expect(parseEurosToCents('12,50')).toBe(1250);
    expect(parseEurosToCents('7,5')).toBe(750);
  });
  it('rejects anything else as NaN', () => {
    for (const bad of ['abc', '-5', '1.234', '1,234,5', '1e3', '12.', '.5', '€5', '1 000']) {
      expect(parseEurosToCents(bad), bad).toBeNaN();
    }
  });
  it('avoids float errors', () => {
    expect(parseEurosToCents('1.15')).toBe(115);
    expect(parseEurosToCents('4.35')).toBe(435);
    expect(parseEurosToCents('19.99')).toBe(1999);
  });
});

describe('dates', () => {
  it('formats dates day-month-year in UTC with fixed month names', () => {
    expect(formatDate('2026-09-12T00:00:00Z')).toBe('12 Sep 2026');
    expect(formatDate('2026-12-31T23:59:59Z')).toBe('31 Dec 2026');
    expect(formatDate('not a date')).toBe('');
    expect(formatDate('2027-03-01T12:00:00Z')).toBe('1 Mar 2027');
    expect(formatDate('2027-03-01T23:30:00-05:00')).toBe('2 Mar 2027');
  });
  it('labels deadlines', () => {
    expect(deadlineLabel('2027-03-01T12:00:00Z')).toBe('Due 1 Mar 2027');
    expect(deadlineLabel(null)).toBe('No deadline');
    expect(deadlineLabel(undefined)).toBe('No deadline');
  });
});

describe('postedAgo', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const H = 3_600_000;
  const D = 24 * H;

  it('says today for anything in the last 24 hours (and clock skew)', () => {
    expect(postedAgo(ago(0), now)).toBe('Posted today');
    expect(postedAgo(ago(23 * H), now)).toBe('Posted today');
    expect(postedAgo(ago(D - 1), now)).toBe('Posted today');
    expect(postedAgo(ago(-5 * 60_000), now)).toBe('Posted today');
  });
  it('says yesterday between 24 and 48 hours', () => {
    expect(postedAgo(ago(D), now)).toBe('Posted yesterday');
    expect(postedAgo(ago(2 * D - 1), now)).toBe('Posted yesterday');
  });
  it('counts days up to a week', () => {
    expect(postedAgo(ago(2 * D), now)).toBe('Posted 2 days ago');
    expect(postedAgo(ago(7 * D - 1), now)).toBe('Posted 6 days ago');
  });
  it('counts weeks up to 30 days', () => {
    expect(postedAgo(ago(7 * D), now)).toBe('Posted 1 week ago');
    expect(postedAgo(ago(14 * D), now)).toBe('Posted 2 weeks ago');
    expect(postedAgo(ago(30 * D - 1), now)).toBe('Posted 4 weeks ago');
  });
  it('gives the date after that', () => {
    expect(postedAgo(ago(30 * D), now)).toBe('Posted on 12 Sep 2026');
    expect(postedAgo('2025-01-05T10:00:00Z', now)).toBe('Posted on 5 Jan 2025');
  });
});

describe('labels', () => {
  it('names the known categories and title-cases unknown ones', () => {
    expect(categoryLabel('development')).toBe('Development');
    expect(categoryLabel('data')).toBe('Data & AI');
    expect(categoryLabel('devops')).toBe('DevOps');
    expect(categoryLabel('machine-learning')).toBe('Machine learning');
    expect(categoryLabel('web_scraping')).toBe('Web scraping');
    expect(categoryLabel(null)).toBe('General');
    expect(categoryLabel('')).toBe('General');
  });
  it('has a stable category list with unique values', () => {
    const values = GIG_CATEGORIES.map((c) => c.value);
    expect(values).toEqual(['development', 'automation', 'data', 'design', 'devops', 'security', 'writing', 'other']);
    expect(new Set(values).size).toBe(values.length);
  });
  it('labels job statuses', () => {
    expect(jobStatusLabel('open')).toBe('Open');
    expect(jobStatusLabel('in_progress')).toBe('In progress');
    expect(jobStatusLabel('awarded')).toBe('Awarded');
    expect(jobStatusLabel('draft')).toBe('Draft');
    expect(jobStatusLabel('delivered')).toBe('Delivered');
    expect(jobStatusLabel('completed')).toBe('Completed');
    expect(jobStatusLabel('cancelled')).toBe('Cancelled');
    expect(jobStatusLabel('disputed')).toBe('Disputed');
  });
  it('labels contract statuses', () => {
    expect(contractStatusLabel('pending_payment')).toBe('Awaiting payment');
    expect(contractStatusLabel('active')).toBe('In progress');
    expect(contractStatusLabel('in_qa')).toBe('In QA');
    expect(contractStatusLabel('rework')).toBe('Changes requested');
    expect(contractStatusLabel('submitted')).toBe('Submitted');
    expect(contractStatusLabel('delivered')).toBe('Delivered');
    expect(contractStatusLabel('completed')).toBe('Completed');
    expect(contractStatusLabel('disputed')).toBe('Disputed');
    expect(contractStatusLabel('cancelled')).toBe('Cancelled');
    expect(contractStatusLabel('refunded')).toBe('Refunded');
  });
});
