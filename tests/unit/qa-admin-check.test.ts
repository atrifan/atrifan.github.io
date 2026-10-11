import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQaAdmin, adminUserIdsFromEnv } from '../../src/lib/qa/admin-check.ts';

const ADMINS = ['boss@tulzo.online', 'ops@tulzo.online'];

test('an admin email (case-insensitive) makes a user admin', () => {
  assert.equal(isQaAdmin({ userId: 'u1', emails: ['Boss@Tulzo.Online'] }, { adminEmails: ADMINS, adminUserIds: [] }), true);
  assert.equal(isQaAdmin({ userId: 'u1', emails: ['someone@x.com', 'ops@tulzo.online'] }, { adminEmails: ADMINS, adminUserIds: [] }), true);
});

test('Clerk publicMetadata.role === "admin" makes a user admin', () => {
  assert.equal(isQaAdmin({ userId: 'u1', emails: [], publicMetadata: { role: 'admin' } }, { adminEmails: ADMINS, adminUserIds: [] }), true);
  for (const role of ['Admin', 'moderator', '', undefined, 1]) {
    assert.equal(isQaAdmin({ userId: 'u1', emails: [], publicMetadata: { role } }, { adminEmails: ADMINS, adminUserIds: [] }), false, String(role));
  }
});

test('ADMIN_USER_IDS makes a user admin', () => {
  assert.equal(isQaAdmin({ userId: 'user_admin' }, { adminEmails: [], adminUserIds: ['user_admin'] }), true);
  assert.equal(isQaAdmin({ userId: 'user_other' }, { adminEmails: [], adminUserIds: ['user_admin'] }), false);
});

test('everyone else is not an admin', () => {
  assert.equal(isQaAdmin({ userId: 'u1', emails: ['someone@x.com', null, undefined, ''] }, { adminEmails: ADMINS, adminUserIds: [] }), false);
  assert.equal(isQaAdmin({ userId: '', emails: [] }, { adminEmails: ADMINS, adminUserIds: [''] }), false);
  assert.equal(isQaAdmin({ userId: 'u1', publicMetadata: null }, { adminEmails: ADMINS, adminUserIds: [] }), false);
  assert.equal(isQaAdmin({ userId: 'u1', emails: ['boss@tulzo.online.evil.com'] }, { adminEmails: ADMINS, adminUserIds: [] }), false);
});

test('adminUserIdsFromEnv splits and trims ADMIN_USER_IDS', () => {
  assert.deepEqual(adminUserIdsFromEnv({}), []);
  assert.deepEqual(adminUserIdsFromEnv({ ADMIN_USER_IDS: ' user_a , ,user_b ' }), ['user_a', 'user_b']);
});
