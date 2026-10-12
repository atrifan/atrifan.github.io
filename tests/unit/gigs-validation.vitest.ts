import { describe, expect, it } from 'vitest';
import {
  dateInputToIso,
  emptySpecForm,
  isoToDateInput,
  parseWholeNumber,
  specToForm,
  splitLabels,
  splitLines,
  validateBid,
  validateDescribe,
  validateOffer,
  validateSpec,
  type BidForm,
  type DescribeForm,
  type OfferForm,
  type SpecForm,
} from '@/src/lib/jobs/client/validation';

const now = new Date('2026-10-12T12:00:00.000Z');

describe('splitLines', () => {
  it('splits on newlines, trims, drops blanks and list bullets', () => {
    expect(splitLines(' a \r\n\n- b\n* c\n• d\n  -e\n')).toEqual(['a', 'b', 'c', 'd', '-e']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines('   \n  ')).toEqual([]);
  });
});

describe('splitLabels', () => {
  it('splits on commas, trims, drops blanks and case-insensitive duplicates', () => {
    expect(splitLabels(' Next.js, react ,, React, TypeScript ')).toEqual(['Next.js', 'react', 'TypeScript']);
    expect(splitLabels('')).toEqual([]);
  });
});

describe('parseWholeNumber', () => {
  it('parses whole numbers, null for empty, NaN otherwise', () => {
    expect(parseWholeNumber('5')).toBe(5);
    expect(parseWholeNumber(' 0 ')).toBe(0);
    expect(parseWholeNumber('')).toBeNull();
    expect(parseWholeNumber(undefined)).toBeNull();
    for (const bad of ['5.5', 'abc', '-1', '1e2']) expect(parseWholeNumber(bad), bad).toBeNaN();
  });
});

describe('date inputs', () => {
  it('maps a date input to the end of that day in UTC', () => {
    expect(dateInputToIso('2027-03-01')).toBe('2027-03-01T23:59:59.000Z');
    expect(dateInputToIso('')).toBeNull();
    expect(dateInputToIso('2027-02-30')).toBeUndefined();
    expect(dateInputToIso('01/03/2027')).toBeUndefined();
  });
  it('maps an ISO date back to a date input value', () => {
    expect(isoToDateInput('2027-03-01T23:59:59.000Z')).toBe('2027-03-01');
    expect(isoToDateInput(null)).toBe('');
    expect(isoToDateInput('garbage')).toBe('');
  });
});

describe('validateDescribe', () => {
  const ok: DescribeForm = {
    title: '  CSV import endpoint ',
    description: 'Build an endpoint that imports CSV files.',
    category: 'development',
    minBudget: '200',
    maxBudget: '400',
    deadline: '2027-03-01',
  };

  it('returns the create-job payload in cents', () => {
    expect(validateDescribe(ok, now)).toEqual({
      ok: true,
      value: {
        title: 'CSV import endpoint',
        description: 'Build an endpoint that imports CSV files.',
        category: 'development',
        budget_min_cents: 20000,
        budget_max_cents: 40000,
        deadline: '2027-03-01T23:59:59.000Z',
      },
    });
  });

  it('allows the optional fields to be empty', () => {
    const r = validateDescribe({ ...ok, category: '', minBudget: '', maxBudget: '', deadline: '' }, now);
    expect(r).toEqual({ ok: true, value: { title: 'CSV import endpoint', description: ok.description, category: null, budget_min_cents: null, budget_max_cents: null, deadline: null } });
  });

  it('needs a title and a description', () => {
    const r = validateDescribe({ ...ok, title: ' ab ', description: 'too short' }, now);
    expect(r).toEqual({
      ok: false,
      errors: {
        title: 'Give your job a title of at least 3 characters',
        description: 'Describe the outcome in at least 10 characters',
      },
    });
  });

  it('limits title and description length', () => {
    const r = validateDescribe({ ...ok, title: 'x'.repeat(201), description: 'y'.repeat(10001) }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.title).toBe('Keep the title under 200 characters');
      expect(r.errors.description).toBe('Keep the description under 10,000 characters');
    }
    expect(validateDescribe({ ...ok, title: 'x'.repeat(200), description: 'y'.repeat(10000) }, now).ok).toBe(true);
    expect(validateDescribe({ ...ok, title: 'abc', description: 'y'.repeat(10) }, now).ok).toBe(true);
  });

  it('checks the budget amounts and their order', () => {
    expect(validateDescribe({ ...ok, minBudget: '500', maxBudget: '400' }, now)).toEqual({
      ok: false,
      errors: { minBudget: "The minimum budget can't be above the maximum" },
    });
    expect(validateDescribe({ ...ok, minBudget: '400', maxBudget: '400' }, now).ok).toBe(true);
    expect(validateDescribe({ ...ok, minBudget: 'lots', maxBudget: '-3' }, now)).toEqual({
      ok: false,
      errors: { minBudget: 'Enter an amount in euros, like 250', maxBudget: 'Enter an amount in euros, like 250' },
    });
  });

  it('needs a real, future deadline', () => {
    expect(validateDescribe({ ...ok, deadline: '2026-10-11' }, now)).toEqual({ ok: false, errors: { deadline: 'Pick a deadline in the future' } });
    expect(validateDescribe({ ...ok, deadline: '2026-10-12' }, now).ok).toBe(true);
    expect(validateDescribe({ ...ok, deadline: '2026-13-01' }, now)).toEqual({ ok: false, errors: { deadline: 'Pick a valid date' } });
  });
});

describe('validateSpec', () => {
  const ok: SpecForm = {
    requirements: 'Import CSV\nValidate rows',
    deliverables: 'Source code',
    acceptanceCriteria: 'Sample files import',
    constraints: '',
    permittedTools: 'node\nvitest',
    deadline: '2027-03-01',
    minBudget: '200',
    maxBudget: '',
    dataSensitivity: 'internal',
    secretsAllowed: false,
    securityNotes: ' No prod data ',
  };

  it('returns a JobSpec', () => {
    expect(validateSpec(ok, now)).toEqual({
      ok: true,
      value: {
        requirements: ['Import CSV', 'Validate rows'],
        deliverables: ['Source code'],
        acceptance_criteria: ['Sample files import'],
        constraints: [],
        permitted_tools: ['node', 'vitest'],
        deadline: '2027-03-01T23:59:59.000Z',
        budget_min_cents: 20000,
        budget_max_cents: null,
        security: { data_sensitivity: 'internal', secrets_allowed: false, notes: 'No prod data' },
      },
    });
  });

  it('needs requirements, deliverables and acceptance criteria', () => {
    expect(validateSpec({ ...ok, requirements: ' ', deliverables: '', acceptanceCriteria: '\n' }, now)).toEqual({
      ok: false,
      errors: {
        requirements: 'Add at least one requirement',
        deliverables: 'Add at least one deliverable',
        acceptanceCriteria: 'Add at least one acceptance criterion',
      },
    });
  });

  it('limits lines and their length', () => {
    const many = Array.from({ length: 51 }, (_, i) => `item ${i}`).join('\n');
    const r = validateSpec({ ...ok, requirements: many, constraints: 'x'.repeat(2001), permittedTools: 't'.repeat(201) }, now);
    expect(r).toEqual({
      ok: false,
      errors: {
        requirements: 'Keep it to 50 lines or fewer',
        constraints: 'Keep each line under 2,000 characters',
        permittedTools: 'Keep each tool under 200 characters',
      },
    });
    const fifty = Array.from({ length: 50 }, (_, i) => `item ${i}`).join('\n');
    expect(validateSpec({ ...ok, requirements: fifty, constraints: 'x'.repeat(2000), permittedTools: 't'.repeat(200) }, now).ok).toBe(true);
  });

  it('checks budget, deadline, sensitivity and notes', () => {
    const r = validateSpec(
      { ...ok, minBudget: '9', maxBudget: '1', deadline: '2020-01-01', dataSensitivity: 'secret' as SpecForm['dataSensitivity'], securityNotes: 'n'.repeat(2001) },
      now,
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        minBudget: "The minimum budget can't be above the maximum",
        deadline: 'Pick a deadline in the future',
        dataSensitivity: 'Choose how sensitive the data is',
        securityNotes: 'Keep the security notes under 2,000 characters',
      },
    });
  });
});

describe('specToForm', () => {
  it('turns a saved spec back into form values', () => {
    expect(
      specToForm({
        requirements: ['a', 'b'],
        deliverables: ['c'],
        acceptance_criteria: ['d'],
        constraints: [],
        permitted_tools: ['node'],
        deadline: '2027-03-01T23:59:59.000Z',
        budget_min_cents: 20050,
        budget_max_cents: null,
        security: { data_sensitivity: 'confidential', secrets_allowed: true, notes: 'n' },
      }),
    ).toEqual({
      requirements: 'a\nb',
      deliverables: 'c',
      acceptanceCriteria: 'd',
      constraints: '',
      permittedTools: 'node',
      deadline: '2027-03-01',
      minBudget: '200.50',
      maxBudget: '',
      dataSensitivity: 'confidential',
      secretsAllowed: true,
      securityNotes: 'n',
    });
  });

  it('starts an empty form from the job budget and deadline', () => {
    expect(emptySpecForm({ budget_min_cents: 20000, budget_max_cents: 40000, deadline: '2027-03-01T23:59:59.000Z' })).toEqual({
      requirements: '',
      deliverables: '',
      acceptanceCriteria: '',
      constraints: '',
      permittedTools: '',
      deadline: '2027-03-01',
      minBudget: '200',
      maxBudget: '400',
      dataSensitivity: 'internal',
      secretsAllowed: false,
      securityNotes: '',
    });
    expect(emptySpecForm(null)).toMatchObject({ deadline: '', minBudget: '', maxBudget: '' });
  });
});

describe('validateOffer', () => {
  const ok: OfferForm = { title: 'CSV importers', description: 'I build CSV importers fast.', labels: 'csv, node', category: 'development', price: '150', deliveryDays: '5' };

  it('returns the create-offer payload', () => {
    expect(validateOffer(ok)).toEqual({
      ok: true,
      value: { title: 'CSV importers', description: 'I build CSV importers fast.', tags: ['csv', 'node'], category: 'development', price_cents: 15000, delivery_days: 5 },
    });
    const noCategory = validateOffer({ ...ok, category: '' });
    expect(noCategory.ok && 'category' in noCategory.value).toBe(false);
  });

  it('explains every invalid field', () => {
    expect(validateOffer({ title: 'ab', description: 'short', labels: '', category: '', price: '', deliveryDays: '0' })).toEqual({
      ok: false,
      errors: {
        title: 'Give your offer a title of at least 3 characters',
        description: 'Describe the service in at least 10 characters',
        price: 'Set a price of at least €5',
        deliveryDays: 'Delivery time must be between 1 and 365 days',
      },
    });
    expect(validateOffer({ ...ok, price: '4.99', deliveryDays: '366' })).toEqual({
      ok: false,
      errors: { price: 'Set a price of at least €5', deliveryDays: 'Delivery time must be between 1 and 365 days' },
    });
    expect(validateOffer({ ...ok, price: 'abc', deliveryDays: '2.5' }).ok).toBe(false);
    expect(validateOffer({ ...ok, price: '5', deliveryDays: '365' }).ok).toBe(true);
    expect(validateOffer({ ...ok, deliveryDays: '1' }).ok).toBe(true);
  });

  it('limits lengths and labels', () => {
    const r = validateOffer({ ...ok, title: 't'.repeat(201), description: 'd'.repeat(5001), labels: Array.from({ length: 21 }, (_, i) => `l${i}`).join(',') });
    expect(r).toEqual({
      ok: false,
      errors: {
        title: 'Keep the title under 200 characters',
        description: 'Keep the description under 5,000 characters',
        labels: 'Use at most 20 labels of up to 50 characters',
      },
    });
    expect(validateOffer({ ...ok, labels: 'x'.repeat(51) }).ok).toBe(false);
    expect(validateOffer({ ...ok, labels: 'x'.repeat(50) }).ok).toBe(true);
  });
});

describe('validateBid', () => {
  const bounds = { minCents: 500, maxCents: 5_000_000 };
  const ok: BidForm = { price: '300', etaDays: '5', plan: ' Do it well ', deliverables: 'PR\nREADME', steering: '2', assumptions: '' };

  it('returns the bid payload', () => {
    expect(validateBid(ok, bounds)).toEqual({
      ok: true,
      value: { price_cents: 30000, eta_days: 5, plan: 'Do it well', deliverables: ['PR', 'README'], included_steering_credits: 2, assumptions: [] },
    });
  });

  it('treats an empty steering field as none and omits an empty plan', () => {
    const r = validateBid({ ...ok, steering: '', plan: '  ' }, bounds);
    expect(r).toEqual({ ok: true, value: { price_cents: 30000, eta_days: 5, deliverables: ['PR', 'README'], included_steering_credits: 0, assumptions: [] } });
  });

  it('enforces the bid bounds', () => {
    expect(validateBid({ ...ok, price: '4.99' }, bounds)).toEqual({ ok: false, errors: { price: 'Bids start at €5' } });
    expect(validateBid({ ...ok, price: '' }, bounds)).toEqual({ ok: false, errors: { price: 'Bids start at €5' } });
    expect(validateBid({ ...ok, price: '50000.01' }, bounds)).toEqual({ ok: false, errors: { price: 'Bids can be at most €50,000' } });
    expect(validateBid({ ...ok, price: '5' }, bounds).ok).toBe(true);
    expect(validateBid({ ...ok, price: '50000' }, bounds).ok).toBe(true);
  });

  it('checks delivery days, steering and plan length', () => {
    expect(validateBid({ ...ok, etaDays: '0', steering: '101', plan: 'p'.repeat(10001) }, bounds)).toEqual({
      ok: false,
      errors: {
        etaDays: 'Delivery estimate must be between 1 and 365 days',
        steering: 'Steering interactions must be between 0 and 100',
        plan: 'Keep the plan under 10,000 characters',
      },
    });
    expect(validateBid({ ...ok, etaDays: '366' }, bounds).ok).toBe(false);
    expect(validateBid({ ...ok, etaDays: '' }, bounds).ok).toBe(false);
    expect(validateBid({ ...ok, steering: '1.5' }, bounds).ok).toBe(false);
    expect(validateBid({ ...ok, etaDays: '365', steering: '100', plan: 'p'.repeat(10000) }, bounds).ok).toBe(true);
    expect(validateBid({ ...ok, etaDays: '1', steering: '0' }, bounds).ok).toBe(true);
  });
});
