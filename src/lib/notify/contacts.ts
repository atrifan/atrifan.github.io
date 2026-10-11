import type { Contact } from './types.ts';

type Loose = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pick(obj: Loose, ...keys: string[]): unknown {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}

/**
 * Maps a Clerk user to a contact. Accepts both the webhook payload (snake_case)
 * and the Backend SDK `User` object (camelCase), so the webhook and the backfill share it.
 */
export function contactFromClerkUser(user: unknown): Contact | null {
  if (!user || typeof user !== 'object') return null;
  const u = user as Loose;
  const userId = str(u.id);
  if (!userId) return null;

  const primaryId = str(pick(u, 'primary_email_address_id', 'primaryEmailAddressId'));
  const addresses = (pick(u, 'email_addresses', 'emailAddresses') as Loose[] | undefined) ?? [];
  const primary = addresses.find((a) => a && str(a.id) === primaryId) ?? null;
  const email = primary ? str(pick(primary, 'email_address', 'emailAddress'))?.toLowerCase() ?? null : null;
  const verification = primary?.verification as Loose | null | undefined;

  const first = str(pick(u, 'first_name', 'firstName'));
  const last = str(pick(u, 'last_name', 'lastName'));
  const name = [first, last].filter(Boolean).join(' ') || str(u.username);

  const metadata = (pick(u, 'public_metadata', 'publicMetadata') as Loose | undefined) ?? {};
  const locale = str(u.locale) ?? str(metadata.locale);

  return {
    userId,
    email,
    name: name || null,
    locale,
    emailVerified: Boolean(email) && verification?.status === 'verified',
  };
}
