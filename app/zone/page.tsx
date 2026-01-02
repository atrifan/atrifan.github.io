'use client';

import dynamic from 'next/dynamic';

const ZonePage = dynamic(() => import('@/src/views/ZonePage').then(mod => mod.ZonePage), {
  ssr: false,
});

export default function Zone() {
  return <ZonePage />;
}
