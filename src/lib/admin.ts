import { currentUser } from '@clerk/nextjs/server';

const ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses?.some(e => ADMIN_EMAILS.includes(e.emailAddress)) ?? false;
}
