import { describe, expect, it, vi } from 'vitest';
import {
  adminRecipientIds,
  adminUserIdsFromEnv,
  getAdminEmails,
  isAdminSubject,
  isAdminUserId,
  type AdminSubject,
} from '@/src/lib/admin';

/** The one admin rule (src/lib/admin.ts): verified admin email, else Clerk role=admin, else ADMIN_USER_IDS. */

const ENV = { ADMIN_EMAILS: 'Boss@Tulzo.Online, ops@tulzo.online', ADMIN_USER_IDS: 'user_ids_admin' };
const SEED = 'trifan.alex.criss@gmail.com';

const verified = (emailAddress: string) => ({ emailAddress, verification: { status: 'verified' } });
const unverified = (emailAddress: string) => ({ emailAddress, verification: { status: 'unverified' } });
const user = (over: AdminSubject = {}): AdminSubject => ({ id: 'user_x', emailAddresses: [], publicMetadata: {}, ...over });

describe('isAdminSubject', () => {
  it('a verified admin email is admin', () => {
    expect(isAdminSubject(user({ emailAddresses: [verified('boss@tulzo.online')] }), ENV)).toBe(true);
  });

  it('an unverified admin email with no role is not admin', () => {
    expect(isAdminSubject(user({ emailAddresses: [unverified('boss@tulzo.online')] }), ENV)).toBe(false);
    expect(isAdminSubject(user({ emailAddresses: [{ emailAddress: 'boss@tulzo.online' }] }), ENV)).toBe(false);
    expect(isAdminSubject(user({ emailAddresses: [{ emailAddress: 'boss@tulzo.online', verification: null }] }), ENV)).toBe(false);
  });

  it('role=admin with a non-admin email is admin (fallback)', () => {
    expect(isAdminSubject(user({ emailAddresses: [verified('someone@example.com')], publicMetadata: { role: 'admin' } }), ENV)).toBe(true);
  });

  it('a user id in ADMIN_USER_IDS is admin', () => {
    expect(isAdminSubject(user({ id: 'user_ids_admin' }), ENV)).toBe(true);
  });

  it('none of these is not admin', () => {
    expect(isAdminSubject(user({ emailAddresses: [verified('someone@example.com')] }), ENV)).toBe(false);
    expect(isAdminSubject({}, ENV)).toBe(false);
    expect(isAdminSubject(user({ publicMetadata: null, emailAddresses: null }), ENV)).toBe(false);
  });

  it('compares emails case-insensitively, counts the seed and any verified address of several', () => {
    expect(isAdminSubject(user({ emailAddresses: [verified('OPS@tulzo.ONLINE')] }), ENV)).toBe(true);
    expect(isAdminSubject(user({ emailAddresses: [verified(SEED.toUpperCase())] }), {})).toBe(true);
    expect(isAdminSubject(user({ emailAddresses: [unverified('boss@tulzo.online'), verified('ops@tulzo.online')] }), ENV)).toBe(true);
  });

  it('only an exact address and only role "admin" count', () => {
    expect(isAdminSubject(user({ emailAddresses: [verified('boss@tulzo.online.evil.com')] }), ENV)).toBe(false);
    expect(isAdminSubject(user({ emailAddresses: [verified('xboss@tulzo.online')] }), ENV)).toBe(false);
    for (const role of ['Admin', 'admin ', 'superadmin', true, 1, ['admin']]) {
      expect(isAdminSubject(user({ publicMetadata: { role } }), ENV), String(role)).toBe(false);
    }
  });

  it('an empty id never matches an empty ADMIN_USER_IDS entry', () => {
    expect(isAdminSubject(user({ id: '' }), { ADMIN_USER_IDS: ' , ' })).toBe(false);
    expect(isAdminSubject(user({ id: null }), ENV)).toBe(false);
  });
});

describe('env lists', () => {
  it('ADMIN_EMAILS is split, trimmed, lowercased, deduplicated and joined with the seed', () => {
    expect(getAdminEmails({ ADMIN_EMAILS: ' A@x.io ,, b@x.io, a@X.io ' })).toEqual([SEED, 'a@x.io', 'b@x.io']);
    expect(getAdminEmails({})).toEqual([SEED]);
  });

  it('ADMIN_USER_IDS is split and trimmed', () => {
    expect(adminUserIdsFromEnv({})).toEqual([]);
    expect(adminUserIdsFromEnv({ ADMIN_USER_IDS: ' user_a , ,user_b ' })).toEqual(['user_a', 'user_b']);
  });
});

describe('isAdminUserId', () => {
  it('ADMIN_USER_IDS answers without a Clerk lookup', async () => {
    const lookup = vi.fn();
    expect(await isAdminUserId('user_ids_admin', { env: ENV, lookup })).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('otherwise applies the rule to the looked-up Clerk user', async () => {
    const byId: Record<string, AdminSubject> = {
      u_mail: user({ id: 'u_mail', emailAddresses: [verified('boss@tulzo.online')] }),
      u_unverified: user({ id: 'u_unverified', emailAddresses: [unverified('boss@tulzo.online')] }),
      u_role: user({ id: 'u_role', publicMetadata: { role: 'admin' } }),
      u_plain: user({ id: 'u_plain', emailAddresses: [verified('a@b.c')] }),
    };
    const lookup = async (id: string) => byId[id] ?? null;
    expect(await isAdminUserId('u_mail', { env: ENV, lookup })).toBe(true);
    expect(await isAdminUserId('u_role', { env: ENV, lookup })).toBe(true);
    expect(await isAdminUserId('u_unverified', { env: ENV, lookup })).toBe(false);
    expect(await isAdminUserId('u_plain', { env: ENV, lookup })).toBe(false);
    expect(await isAdminUserId('u_missing', { env: ENV, lookup })).toBe(false);
  });

  it('with no lookup (the e2e identity) only ADMIN_USER_IDS counts', async () => {
    expect(await isAdminUserId('user_ids_admin', { env: ENV, lookup: null })).toBe(true);
    expect(await isAdminUserId('u_other', { env: ENV, lookup: null })).toBe(false);
  });

  it('a failed lookup is not admin', async () => {
    const lookup = async () => {
      throw new Error('clerk down');
    };
    expect(await isAdminUserId('u_x', { env: ENV, lookup })).toBe(false);
  });

  it('an empty user id is never admin', async () => {
    const lookup = vi.fn(async () => user({ publicMetadata: { role: 'admin' } }));
    expect(await isAdminUserId('', { env: { ADMIN_USER_IDS: '' }, lookup })).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('adminRecipientIds', () => {
  it('is every user matching the rule: ADMIN_USER_IDS, verified admin contacts and Clerk users with the role or a verified admin email', () => {
    const ids = adminRecipientIds({
      env: ENV,
      contacts: [
        { userId: 'c_admin', email: 'Boss@tulzo.online', emailVerified: true },
        { userId: 'c_unverified', email: 'ops@tulzo.online', emailVerified: false },
        { userId: 'c_plain', email: 'a@b.c', emailVerified: true },
        { userId: 'c_none', email: null, emailVerified: false },
      ],
      users: [
        user({ id: 'k_role', publicMetadata: { role: 'admin' } }),
        user({ id: 'k_mail', emailAddresses: [verified('ops@tulzo.online')] }),
        user({ id: 'k_plain', emailAddresses: [verified('x@y.z')] }),
        user({ id: 'c_admin', emailAddresses: [verified('boss@tulzo.online')] }),
      ],
    });
    expect(ids.sort()).toEqual(['c_admin', 'k_mail', 'k_role', 'user_ids_admin']);
  });

  it('is empty when nobody matches', () => {
    expect(adminRecipientIds({ env: { ADMIN_EMAILS: '' }, contacts: [{ userId: 'c', email: 'a@b.c', emailVerified: true }], users: [] })).toEqual([]);
  });
});
