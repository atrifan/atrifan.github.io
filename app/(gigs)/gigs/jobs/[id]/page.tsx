import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { JobDetail } from '@/src/views/gigs/JobDetail';
import { loadJobPage } from '@/src/lib/jobs/ui/loaders';
import { currentUserId } from '@/src/lib/jobs/ui/session';
import { gigsConfig } from '@/src/lib/jobs/ui/config';
import { jobPostingJsonLd, serializeJsonLd } from '@/src/lib/jobs/client/seo';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { surfaceUrl } from '@/src/lib/surface-url';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string }; searchParams: Record<string, string | string[] | undefined> };

const load = cache(async (id: string) => {
  const viewer = await currentUserId();
  return { viewer, data: await loadJobPage(id, viewer) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data } = await load(params.id);
  if (!data) return { title: 'Job not found', robots: { index: false, follow: false } };
  const url = absoluteSurfaceUrl('gigs', `/jobs/${data.job.id}`);
  const description = data.job.description.slice(0, 160);
  const indexable = data.job.status === 'open';
  return {
    title: data.job.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', url, title: data.job.title, description },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { viewer, data } = await load(params.id);
  if (!data) notFound();
  const { base, bps, bounds, qaCosts, windowsNotice } = gigsConfig();
  const url = absoluteSurfaceUrl('gigs', `/jobs/${data.job.id}`);
  const back = surfaceUrl('gigs', `/jobs/${data.job.id}`);
  return (
    <>
      {data.job.status !== 'draft' ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jobPostingJsonLd(data.job, url)) }} />
      ) : null}
      <JobDetail
        data={data}
        base={base}
        now={new Date()}
        viewerId={viewer}
        signInUrl={`${surfaceUrl('hub', '/sign-in')}?redirect_url=${encodeURIComponent(back)}`}
        profileUrl={surfaceUrl('hub', '/profile')}
        bps={bps}
        bounds={bounds}
        qaCosts={qaCosts}
        windowsNotice={windowsNotice}
        published={searchParams.published === '1'}
      />
    </>
  );
}
