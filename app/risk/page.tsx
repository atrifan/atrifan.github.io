'use client';

import dynamic from 'next/dynamic';

const RiskPage = dynamic(() => import('@/src/views/RiskPage').then(mod => mod.RiskPage), {
  ssr: false,
});

export default function Risk() {
  return <RiskPage />;
}
