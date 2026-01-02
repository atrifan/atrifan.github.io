'use client';

import dynamic from 'next/dynamic';

const BrainPage = dynamic(() => import('@/src/views/BrainPage').then(mod => mod.BrainPage), {
  ssr: false,
});

export default function Brain() {
  return <BrainPage />;
}
