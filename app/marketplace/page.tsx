import type { Metadata } from 'next';
import { SurfaceComingSoon, comingSoonTitle } from '@/src/views/SurfaceComingSoon';

export const metadata: Metadata = { title: comingSoonTitle('marketplace') };

/** Placeholder home of the marketplace surface (see src/lib/surface-routing.ts). */
export default function Page() {
  return <SurfaceComingSoon surface="marketplace" />;
}
