'use client';

import dynamic from 'next/dynamic';

const BloodPage = dynamic(() => import('@/src/views/BloodPage').then(mod => mod.BloodPage), {
  ssr: false,
});

export default function Blood() {
  return <BloodPage />;
}

