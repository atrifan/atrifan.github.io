import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactFromClerkUser } from '../../../src/lib/notify/contacts.ts';

test('webhook (snake_case) user maps to the primary email', () => {
  const contact = contactFromClerkUser({
    id: 'user_1',
    first_name: 'Ana',
    last_name: 'Pop',
    primary_email_address_id: 'e2',
    email_addresses: [
      { id: 'e1', email_address: 'old@example.com', verification: { status: 'verified' } },
      { id: 'e2', email_address: 'Ana@Example.com', verification: { status: 'verified' } },
    ],
    public_metadata: { locale: 'ro-RO' },
  });
  assert.deepEqual(contact, { userId: 'user_1', email: 'ana@example.com', name: 'Ana Pop', locale: 'ro-RO', emailVerified: true });
});

test('backend SDK (camelCase) user maps the same way', () => {
  const contact = contactFromClerkUser({
    id: 'user_2',
    firstName: null,
    lastName: null,
    username: 'atlas',
    primaryEmailAddressId: 'e1',
    emailAddresses: [{ id: 'e1', emailAddress: 'a@example.com', verification: { status: 'unverified' } }],
    locale: 'en-GB',
  });
  assert.deepEqual(contact, { userId: 'user_2', email: 'a@example.com', name: 'atlas', locale: 'en-GB', emailVerified: false });
});

test('a user without a primary email gets a null email', () => {
  const contact = contactFromClerkUser({ id: 'user_3', email_addresses: [], primary_email_address_id: null });
  assert.equal(contact?.email, null);
  assert.equal(contact?.emailVerified, false);
  assert.equal(contact?.name, null);
});

test('an object without an id is rejected', () => {
  assert.equal(contactFromClerkUser({}), null);
  assert.equal(contactFromClerkUser(null), null);
});
