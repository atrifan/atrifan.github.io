import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { PackageAdminPage } from '@/src/views/PackageAdminPage';

const ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

export default async function AdminPackages() {
  const user = await currentUser();
  const isAdmin = user?.emailAddresses?.some(e => ADMIN_EMAILS.includes(e.emailAddress));

  if (!isAdmin) {
    redirect('/dashboard');
  }

  return <PackageAdminPage />;
}
