import { createClerkClient } from '@clerk/backend';

/**
 * E2E users in the Clerk development instance. `+clerk_test` addresses are
 * Clerk test emails: no real mail is sent and they verify without a code.
 */
export const E2E_USERS = {
  customer: { email: 'tulzo-e2e-customer+clerk_test@example.com', firstName: 'Cara', lastName: 'Customer' },
  provider: { email: 'tulzo-e2e-provider+clerk_test@example.com', firstName: 'Pat', lastName: 'Provider' },
  admin: { email: 'tulzo-e2e-admin+clerk_test@example.com', firstName: 'Ada', lastName: 'Admin', role: 'admin' },
} as const;

export type E2ERole = keyof typeof E2E_USERS;

export const storageStatePath = (role: E2ERole) => `tests/.auth/${role}.json`;

export function hasClerkTestEnv(): boolean {
  const key = process.env.CLERK_SECRET_KEY ?? '';
  return key.startsWith('sk_test_') && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

/** Create the E2E users if missing; returns Clerk user ids by role. */
export async function ensureE2EUsers(): Promise<Record<E2ERole, string>> {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const ids = {} as Record<E2ERole, string>;
  for (const role of Object.keys(E2E_USERS) as E2ERole[]) {
    const u = E2E_USERS[role];
    const found = await clerk.users.getUserList({ emailAddress: [u.email] });
    let user = found.data[0];
    if (!user) {
      user = await clerk.users.createUser({
        emailAddress: [u.email],
        firstName: u.firstName,
        lastName: u.lastName,
        skipPasswordRequirement: true,
      });
    }
    if ('role' in u && user.publicMetadata?.role !== u.role) {
      await clerk.users.updateUserMetadata(user.id, { publicMetadata: { role: u.role } });
    }
    ids[role] = user.id;
  }
  return ids;
}
