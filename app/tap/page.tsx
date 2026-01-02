'use client';

import dynamic from 'next/dynamic';

const TapPage = dynamic(() => import('@/src/views/TapPage').then(mod => mod.TapPage), {
  ssr: false,
});

export default function Tap() {
  return <TapPage />;
}
