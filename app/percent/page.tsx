'use client';

import dynamic from 'next/dynamic';

const PercentPage = dynamic(() => import('@/src/views/PercentPage').then(mod => mod.PercentPage), {
  ssr: false,
});

export default function Percent() {
  return <PercentPage />;
}
