'use client';

import dynamic from 'next/dynamic';

const MatchPage = dynamic(() => import('@/src/views/MatchPage').then(mod => mod.MatchPage), {
  ssr: false,
});

export default function Match() {
  return <MatchPage />;
}
