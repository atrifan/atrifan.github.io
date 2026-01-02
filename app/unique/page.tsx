'use client';

import dynamic from 'next/dynamic';

const RankPage = dynamic(() => import('@/src/views/RankPage').then(mod => mod.RankPage), {
  ssr: false,
});

export default function Unique() {
  return <RankPage />;
}
