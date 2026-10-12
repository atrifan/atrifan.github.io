import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_OFF_BY_DEFAULT, gateInApp, gateNotification, resolveInAppPreferences, resolvePreferences } from '../../../src/lib/notify/preferences.ts';
import { NOTIFICATION_TYPES, type Contact } from '../../../src/lib/notify/types.ts';

const contact: Contact = { userId: 'u1', email: 'a@example.com', name: 'Ana', locale: null, emailVerified: true };

test('every type is enabled when the user has no preference rows, except the email-off-by-default ones', () => {
  const prefs = resolvePreferences([]);
  assert.deepEqual(Object.keys(prefs).sort(), [...NOTIFICATION_TYPES].sort());
  // Support notices: admins already get the forwarded email (src/lib/support/support-service.ts).
  const off = ['package_installed', 'support_complaint_received', 'support_email_received'];
  assert.deepEqual([...EMAIL_OFF_BY_DEFAULT], off);
  for (const type of NOTIFICATION_TYPES) assert.equal(prefs[type], !off.includes(type), type);
});

test('package installs send no email by default but can be switched on', () => {
  assert.deepEqual(gateNotification(contact, [], 'package_installed'), { send: false, reason: 'unsubscribed' });
  assert.deepEqual(gateNotification(contact, [{ type: 'package_installed', emailEnabled: true }], 'package_installed'), { send: true });
});

test('a row with no email choice (null) keeps the email default', () => {
  const prefs = resolvePreferences([
    { type: 'bid_received', emailEnabled: null, inAppEnabled: false },
    { type: 'package_installed', emailEnabled: null, inAppEnabled: false },
  ]);
  assert.equal(prefs.bid_received, true);
  assert.equal(prefs.package_installed, false);
});

test('in-app is on for every type by default; a row turns one type off; null keeps the default', () => {
  const none = resolveInAppPreferences([]);
  assert.deepEqual(Object.keys(none).sort(), [...NOTIFICATION_TYPES].sort());
  for (const type of NOTIFICATION_TYPES) assert.equal(none[type], true, type);
  const some = resolveInAppPreferences([
    { type: 'bid_received', emailEnabled: true, inAppEnabled: false },
    { type: 'payout_sent', emailEnabled: false, inAppEnabled: null },
    { type: 'qa_verdict', emailEnabled: false },
    { type: 'nope' as never, emailEnabled: false, inAppEnabled: false },
  ]);
  assert.equal(some.bid_received, false);
  assert.equal(some.payout_sent, true);
  assert.equal(some.qa_verdict, true);
  assert.equal(Object.keys(some).length, NOTIFICATION_TYPES.length);
});

test('the in-app gate needs no contact or email, only the preference', () => {
  assert.equal(gateInApp([], 'bid_received'), true);
  assert.equal(gateInApp([{ type: 'bid_received', emailEnabled: false, inAppEnabled: true }], 'bid_received'), true);
  assert.equal(gateInApp([{ type: 'bid_received', emailEnabled: true, inAppEnabled: false }], 'bid_received'), false);
  assert.equal(gateInApp([{ type: 'bid_received', emailEnabled: true, inAppEnabled: false }], 'payout_sent'), true);
});

test('a disabled row turns off only that type', () => {
  const prefs = resolvePreferences([{ type: 'bid_received', emailEnabled: false }]);
  assert.equal(prefs.bid_received, false);
  assert.equal(prefs.bid_accepted, true);
});

test('an explicit enabled row keeps the type on', () => {
  const prefs = resolvePreferences([
    { type: 'bid_received', emailEnabled: false },
    { type: 'payout_sent', emailEnabled: true },
  ]);
  assert.equal(prefs.payout_sent, true);
  assert.equal(prefs.bid_received, false);
});

test('rows for unknown types are ignored', () => {
  const prefs = resolvePreferences([{ type: 'not_a_type' as never, emailEnabled: false }]);
  assert.deepEqual(Object.keys(prefs).sort(), [...NOTIFICATION_TYPES].sort());
});

test('a contact with a verified email and no opt-out is sent', () => {
  assert.deepEqual(gateNotification(contact, [], 'bid_received'), { send: true });
  assert.deepEqual(gateNotification(contact, [{ type: 'bid_received', emailEnabled: true }], 'bid_received'), {
    send: true,
  });
});

test('an unsubscribed type is skipped', () => {
  const rows = [{ type: 'bid_received' as const, emailEnabled: false }];
  assert.deepEqual(gateNotification(contact, rows, 'bid_received'), { send: false, reason: 'unsubscribed' });
  assert.deepEqual(gateNotification(contact, rows, 'payout_sent'), { send: true });
});

test('no contact, no email or an unverified email are skipped with a reason', () => {
  assert.deepEqual(gateNotification(null, [], 'bid_received'), { send: false, reason: 'no_contact' });
  assert.deepEqual(gateNotification({ ...contact, email: null }, [], 'bid_received'), {
    send: false,
    reason: 'no_email',
  });
  assert.deepEqual(gateNotification({ ...contact, email: '' }, [], 'bid_received'), {
    send: false,
    reason: 'no_email',
  });
  assert.deepEqual(gateNotification({ ...contact, emailVerified: false }, [], 'bid_received'), {
    send: false,
    reason: 'email_unverified',
  });
});

test('missing email wins over unsubscribed when both apply', () => {
  const rows = [{ type: 'bid_received' as const, emailEnabled: false }];
  assert.deepEqual(gateNotification({ ...contact, email: null }, rows, 'bid_received'), {
    send: false,
    reason: 'no_email',
  });
});
