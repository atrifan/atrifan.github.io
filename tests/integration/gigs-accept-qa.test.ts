import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, resetDb, sql, useFakeStripe, stopFakeStripe, seedEnabledProvider } from './helpers';
import { formToObject, type FakeStripe } from '../support/fake-stripe';

installMocks();

import { http, openJob } from './room-helpers';

let stripe: FakeStripe;
let n = 0;

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

async function bidOnNewJob(): Promise<{ customer: string; bidId: string }> {
  n += 1;
  const customer = `user_acceptqa_c${n}`;
  const provider = `user_acceptqa_p${n}`;
  await seedEnabledProvider(provider);
  const jobId = await openJob(customer, `QA checks job ${n}`);
  const bid = await http('bids', 'POST', `/api/jobs/${jobId}/bids`, {
    user: provider, params: { id: jobId }, body: { price_cents: 30000, eta_days: 7 },
  });
  assert.equal(bid.status, 201, JSON.stringify(bid.body));
  return { customer, bidId: bid.body.bid.id };
}

function accept(customer: string, bidId: string, body?: unknown) {
  return http('accept', 'POST', `/api/bids/${bidId}/accept`, { user: customer, params: { id: bidId }, body });
}

function lastCheckout(): any {
  return formToObject(stripe.requests.filter((r) => r.path === '/v1/checkout/sessions').at(-1)!.form);
}

test('accept with qa_checks stores them on the contract version and shows the QA reserve', async () => {
  const { customer, bidId } = await bidOnNewJob();
  const res = await accept(customer, bidId, { qa_checks: ['security', 'code_review', 'code_review'] });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.version.qa_checks, ['basic', 'code_review', 'security']);
  assert.deepEqual(res.body.qa, {
    checks: ['basic', 'code_review', 'security'],
    reserve: { platform_credits: 60, customer_credits: 750, cap_credits: 810, customer_usd: 7.5 },
  });
  const [row] = await sql<{ qa_checks: string[] }>('SELECT qa_checks FROM contract_versions WHERE id = $1', [res.body.version.id]);
  assert.deepEqual(row.qa_checks, ['basic', 'code_review', 'security']);
  const form = lastCheckout();
  assert.match(form.custom_text.submit.message, /750 credits/);
  assert.match(form.custom_text.submit.message, /\$7\.50/);
  assert.match(form.custom_text.submit.message, /reserved/i);
});

test('accept without qa_checks: basic only, paid by the platform, nothing reserved from the customer', async () => {
  const { customer, bidId } = await bidOnNewJob();
  const res = await accept(customer, bidId);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.version.qa_checks, ['basic']);
  assert.deepEqual(res.body.qa.reserve, { platform_credits: 60, customer_credits: 0, cap_credits: 60, customer_usd: 0 });
  assert.match(lastCheckout().custom_text.submit.message, /Basic QA is included/);
});

test('unknown qa_checks and unknown fields are rejected with 400 before anything changes', async () => {
  const { customer, bidId } = await bidOnNewJob();
  const bad = await accept(customer, bidId, { qa_checks: ['magic'] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'invalid_request');
  const extra = await accept(customer, bidId, { qa: true });
  assert.equal(extra.status, 400);
  const [bid] = await sql<{ status: string }>('SELECT status FROM bids WHERE id = $1', [bidId]);
  assert.equal(bid.status, 'active');
  assert.equal((await accept(customer, bidId, { qa_checks: [] })).status, 201);
});
