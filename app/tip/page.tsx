'use client';

import dynamic from 'next/dynamic';

const TipPage = dynamic(() => import('@/src/views/TipPage').then(mod => mod.TipPage), {
  ssr: false,
});

export default function Tip() {
  return <TipPage />;
}
