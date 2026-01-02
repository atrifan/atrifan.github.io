'use client';

import dynamic from 'next/dynamic';

const SleepPage = dynamic(() => import('@/src/views/SleepPage').then(mod => mod.SleepPage), {
  ssr: false,
});

export default function Sleep() {
  return <SleepPage />;
}
