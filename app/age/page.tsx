'use client';

import dynamic from 'next/dynamic';

const AgePage = dynamic(() => import('@/src/views/AgePage').then(mod => mod.AgePage), {
  ssr: false,
});

export default function Age() {
  return <AgePage />;
}
