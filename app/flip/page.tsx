'use client';

import dynamic from 'next/dynamic';

const FlipPage = dynamic(() => import('@/src/views/FlipPage').then(mod => mod.FlipPage), {
  ssr: false,
});

export default function Flip() {
  return <FlipPage />;
}
