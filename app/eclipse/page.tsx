'use client';

import dynamic from 'next/dynamic';

const EclipsePage = dynamic(() => import('@/src/views/EclipsePage').then(mod => mod.EclipsePage), {
  ssr: false,
});

export default function Eclipse() {
  return <EclipsePage />;
}

