import { currentUser } from '@clerk/nextjs/server';

const PREFERENCED_EMAILS = ['trifan.alex.criss@gmail.com', 'office@etaxhub.ro'];

export async function isPreferenced(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses?.some(e => PREFERENCED_EMAILS.includes(e.emailAddress)) ?? false;
}
