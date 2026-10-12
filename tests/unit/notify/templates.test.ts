import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail } from '../../../src/lib/notify/templates/index.ts';
import { appUrl } from '../../../src/lib/notify/urls.ts';
import { NOTIFICATION_TYPES, parsePayload, type NotificationType } from '../../../src/lib/notify/types.ts';
import { SAMPLE_PAYLOADS } from './samples.ts';

const ctx = {
  recipientName: 'Ana',
  unsubscribeUrl: 'https://tulzo.online/api/notifications/unsubscribe?token=abc.def',
  preferencesUrl: 'https://tulzo.online/profile',
};

function render(type: NotificationType, overrides: Record<string, unknown> = {}) {
  const payload = parsePayload(type, { ...SAMPLE_PAYLOADS[type], ...overrides });
  return renderEmail(type, payload, ctx);
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

for (const type of NOTIFICATION_TYPES) {
  test(`${type}: renders subject, html and text with wordmark, CTA and unsubscribe`, () => {
    const email = render(type);
    assert.ok(email.subject.length > 5 && email.subject.length < 120, `subject: ${email.subject}`);
    assert.doesNotMatch(email.subject, /undefined|null|\[object/);
    assert.match(email.html, /^<!doctype html>/i);
    assert.match(email.html, /Tulzo/);
    assert.match(email.html, /<meta name="color-scheme" content="light dark"/);
    assert.doesNotMatch(email.html + email.text, /undefined|\[object Object\]|NaN/);
    const links = hrefs(email.html);
    assert.ok(links.includes(ctx.unsubscribeUrl), 'html has unsubscribe link');
    assert.ok(links.includes(ctx.preferencesUrl), 'html has preferences link');
    const cta = links.filter((h) => h !== ctx.unsubscribeUrl && h !== ctx.preferencesUrl);
    assert.equal(cta.length, 1, `exactly one call-to-action link, got ${cta.join(', ')}`);
    assert.match(cta[0], /^https:\/\//);
    assert.ok(email.text.includes(cta[0]), 'text has the CTA url');
    assert.ok(email.text.includes(ctx.unsubscribeUrl), 'text has the unsubscribe url');
    assert.match(email.text, /Hi Ana/);
    assert.doesNotMatch(email.text, /<[a-z]/i, 'text has no html tags');
  });
}

test('a payload url overrides the default call-to-action', () => {
  const email = render('bid_received', { url: 'https://gigs.example.test/jobs/job_1/bids' });
  assert.ok(hrefs(email.html).includes('https://gigs.example.test/jobs/job_1/bids'));
});

test('the default CTA points at the job on the gigs surface', () => {
  const email = render('bid_received');
  assert.ok(hrefs(email.html).some((h) => h.startsWith(appUrl('gigs', '/jobs/job_1'))), hrefs(email.html).join(' '));
});

test('user-supplied text is html-escaped', () => {
  const email = render('steering_awaiting_approval', {
    jobTitle: '<script>alert(1)</script>',
    summary: 'a & b "quoted" <img src=x>',
    requestedBy: 'Eve <eve@x>',
  });
  assert.doesNotMatch(email.html, /<script>|<img src=x>|Eve <eve/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /a &amp; b &quot;quoted&quot;/);
  assert.match(email.text, /<script>alert\(1\)<\/script>/, 'text keeps the raw characters');
});

test('the subject has no newlines even if the title does', () => {
  const email = render('job_posted', { jobTitle: 'Line one\r\nBcc: evil@example.com' });
  assert.doesNotMatch(email.subject, /[\r\n]/);
});

test('amounts are formatted as currency', () => {
  assert.match(render('bid_received').html, /\$300\.00/);
  assert.match(render('payout_sent', { amountCents: 123456, currency: 'eur' }).text, /€1,234\.56/);
});

test('QA verdicts read differently for pass and fail', () => {
  const pass = render('qa_verdict', { verdict: 'pass', summary: undefined });
  const fail = render('qa_verdict', { verdict: 'fail' });
  assert.notEqual(pass.subject, fail.subject);
  assert.match(pass.subject, /pass/i);
});

test('greeting falls back when the name is unknown', () => {
  const payload = parsePayload('job_posted', SAMPLE_PAYLOADS.job_posted);
  const email = renderEmail('job_posted', payload, { ...ctx, recipientName: null });
  assert.match(email.text, /^Hi there,/m);
});

test('appUrl builds surface URLs from the root domain', () => {
  assert.equal(appUrl('hub', '/profile', 'tulzo.online'), 'https://tulzo.online/profile');
  assert.equal(appUrl('gigs', '/jobs/1', 'tulzo.online'), 'https://gigs.tulzo.online/jobs/1');
  assert.equal(appUrl('gigs', 'jobs/1', 'tulzo.online'), 'https://gigs.tulzo.online/jobs/1');
  assert.equal(appUrl('gigs', '/jobs/1', 'localhost:3000'), 'http://localhost:3000/gigs/jobs/1');
  assert.equal(appUrl('hub', '/profile', 'localhost:3000'), 'http://localhost:3000/profile');
  assert.equal(appUrl('hub', '/x', 'https://tulzo.online/'), 'https://tulzo.online/x');
});

test('progress_update and milestone_completed link to the job room and quote the update', () => {
  const progress = render('progress_update');
  assert.ok(hrefs(progress.html).some((h) => h.startsWith(appUrl('gigs', '/contracts/c_1'))), hrefs(progress.html).join(' '));
  assert.match(progress.text, /Webhook signature checks are in/);
  assert.match(progress.text, /40%/);
  const milestone = render('milestone_completed');
  assert.ok(hrefs(milestone.html).some((h) => h.startsWith(appUrl('gigs', '/contracts/c_1?tab=milestones'))), hrefs(milestone.html).join(' '));
  assert.match(milestone.subject, /Signature checks/);
});
