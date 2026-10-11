import type { Metadata } from 'next';
import { UserProfile } from '@clerk/nextjs';
import { NOINDEX } from '@/src/lib/hub-seo';

export const metadata: Metadata = { title: 'Manage account', robots: NOINDEX };

/** Clerk's account management (name, email, password, sessions) under /profile/account. */
export default function ManageAccount() {
  return (
    <div className="auth-page">
      <UserProfile path="/profile/account" routing="path" />
    </div>
  );
}
