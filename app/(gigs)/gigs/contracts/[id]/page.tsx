import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContractView } from '@/src/views/gigs/ContractView';
import { loadContractPage } from '@/src/lib/jobs/ui/loaders';
import { requireUserId } from '@/src/lib/jobs/ui/session';
import { gigsConfig } from '@/src/lib/jobs/ui/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contract',
  robots: { index: false, follow: false },
};

type Props = { params: { id: string }; searchParams: Record<string, string | string[] | undefined> };

export default async function Page({ params, searchParams }: Props) {
  const userId = await requireUserId(`/contracts/${params.id}`);
  const data = await loadContractPage(params.id, userId);
  if (!data) notFound();
  const checkout = searchParams.checkout === 'success' || searchParams.checkout === 'cancelled' ? searchParams.checkout : null;
  const { base, windowsNotice } = gigsConfig();
  return <ContractView data={data} base={base} checkout={checkout} windowsNotice={windowsNotice} />;
}
