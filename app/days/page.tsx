'use client';

import dynamic from 'next/dynamic';

const DaysPage = dynamic(() => import('@/src/views/DaysPage').then(mod => mod.DaysPage), {
  ssr: false,
});

export default function Days() {
  return <DaysPage />;
}
