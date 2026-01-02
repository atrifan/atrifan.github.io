'use client';

import dynamic from 'next/dynamic';

const CutPage = dynamic(() => import('@/src/views/CutPage').then(mod => mod.CutPage), {
  ssr: false,
});

export default function Cut() {
  return <CutPage />;
}
