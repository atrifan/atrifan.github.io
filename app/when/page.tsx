'use client';

import dynamic from 'next/dynamic';

const WhenPage = dynamic(() => import('@/src/views/WhenPage').then(mod => mod.WhenPage), {
  ssr: false,
});

export default function When() {
  return <WhenPage />;
}
