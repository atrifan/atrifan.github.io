import type { Metadata } from 'next';
import { SurfaceComingSoon, comingSoonTitle } from '@/src/views/SurfaceComingSoon';

export const metadata: Metadata = { title: comingSoonTitle('ai') };

/** Placeholder home of the ai surface (see src/lib/surface-routing.ts). */
export default function Page() {
  return <SurfaceComingSoon surface="ai" />;
}
