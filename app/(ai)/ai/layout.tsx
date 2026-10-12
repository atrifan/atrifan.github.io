import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AiShell } from '@/src/views/ai/AiShell';
import { isPreferenced } from '@/src/lib/preferenced';
import { planFromClaims } from '@/src/lib/plans';
import { requestSurface } from '@/src/lib/request-surface';
import { SURFACE_PREFIX, surfaceUrl } from '@/src/lib/surface-url';

/**
 * The ai. control panel: `/ai/<section>` in path-prefix mode, `ai.tulzo.online/<section>` on the ai surface
 * (the middleware rewrites `/x` to `/ai/x` there). Signed-in only (also enforced by the middleware), noindex,
 * no ads. The shell (nav, extension status, shared data) lives here so it persists across sections.
 */
export default async function AiLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect(surfaceUrl('hub', '/sign-in'));
  const plan = planFromClaims(sessionClaims as Record<string, unknown> | null);
  const showDownloads = plan !== 'free' || (await isPreferenced());
  const base = requestSurface() === 'ai' ? '' : SURFACE_PREFIX.ai;
  return (
    <AiShell base={base} showDownloads={showDownloads}>
      {children}
    </AiShell>
  );
}
