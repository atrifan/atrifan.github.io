import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PostJobWizard, type WizardStep } from '@/src/views/gigs/PostJobWizard';
import { loadOwnedJobForWizard } from '@/src/lib/jobs/ui/loaders';
import { requireUserId } from '@/src/lib/jobs/ui/session';
import { gigsConfig } from '@/src/lib/jobs/ui/config';
import { gigsHref } from '@/src/lib/jobs/ui/paths';
import { surfaceUrl } from '@/src/lib/surface-url';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Post a job',
  robots: { index: false, follow: false },
};

const STEPS: readonly WizardStep[] = ['describe', 'draft', 'edit', 'publish'];

type Props = { searchParams: Record<string, string | string[] | undefined> };

export default async function Page({ searchParams }: Props) {
  const userId = await requireUserId('/post');
  const { base, qaCosts } = gigsConfig();
  const jobId = typeof searchParams.job === 'string' ? searchParams.job : '';
  const rawStep = typeof searchParams.step === 'string' ? searchParams.step : '';
  const step: WizardStep = (STEPS as readonly string[]).includes(rawStep) ? (rawStep as WizardStep) : 'describe';

  const owned = jobId ? await loadOwnedJobForWizard(jobId, userId) : null;
  // A published job has nothing left to draft: show its page instead.
  if (owned && owned.job.status !== 'draft') redirect(gigsHref(base, `/jobs/${owned.job.id}`));

  return (
    <PostJobWizard
      key={owned?.job.id ?? 'new'}
      base={base}
      creditsUrl={surfaceUrl('hub', '/credits')}
      qaCosts={qaCosts}
      initialStep={owned ? step : 'describe'}
      initialJob={
        owned
          ? {
              id: owned.job.id,
              title: owned.job.title,
              description: owned.job.description,
              category: owned.job.category,
              budget_min_cents: owned.job.budget_min_cents,
              budget_max_cents: owned.job.budget_max_cents,
              deadline: owned.job.deadline,
            }
          : null
      }
      initialSpec={owned?.spec ?? null}
    />
  );
}
