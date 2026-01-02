'use client';

import dynamic from 'next/dynamic';

const CyclePage = dynamic(() => import('@/src/views/CyclePage').then(mod => mod.CyclePage), {
  ssr: false,
});

export default function Cycle() {
  return <CyclePage />;
}
