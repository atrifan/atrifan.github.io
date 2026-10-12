import { currentUser } from '@clerk/nextjs/server';
import { isAdminUser } from '@/src/lib/admin';
import { redirect } from 'next/navigation';
import { PackageAdminPage } from '@/src/views/PackageAdminPage';

export default async function AdminPackages() {
  const user = await currentUser();
  const isAdmin = isAdminUser(user);

  if (!isAdmin) {
    redirect('/dashboard');
  }

  return <PackageAdminPage />;
}
