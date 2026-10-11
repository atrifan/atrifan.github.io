/**
 * Backfill `user_contacts` from Clerk. Idempotent: every user is upserted by Clerk id,
 * so it is safe to re-run at any time (e.g. after the notifications migration).
 *
 * Usage:
 *   npx tsx scripts/backfill-user-contacts.ts [--dry-run]
 *
 * Requires CLERK_SECRET_KEY and STORAGE_POSTGRES_URL_NON_POOLING (or STORAGE_POSTGRES_URL); .env.local is loaded.
 * Honors NOTIFY_DB_SCHEMA (default "public").
 */
import { config as loadEnv } from 'dotenv';

// Load env before the Clerk SDK and the DB pool read it.
loadEnv({ path: '.env.local' });

const PAGE_SIZE = 100;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { clerkClient } = await import('@clerk/nextjs/server');
  const { contactFromClerkUser } = await import('../src/lib/notify/contacts');
  const { getNotifyStore } = await import('../src/lib/notify/notify');
  const client = await clerkClient();
  const store = getNotifyStore();

  let offset = 0;
  let seen = 0;
  let upserted = 0;
  let withoutEmail = 0;

  for (;;) {
    const page = await client.users.getUserList({ limit: PAGE_SIZE, offset, orderBy: '+created_at' });
    for (const user of page.data) {
      seen += 1;
      const contact = contactFromClerkUser(user);
      if (!contact) continue;
      if (!contact.email) withoutEmail += 1;
      if (!dryRun) await store.upsertContact(contact);
      upserted += 1;
    }
    offset += page.data.length;
    if (page.data.length < PAGE_SIZE || offset >= page.totalCount) break;
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Clerk users seen: ${seen}, contacts upserted: ${upserted}, without a primary email: ${withoutEmail}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
