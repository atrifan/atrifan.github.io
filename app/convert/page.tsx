'use client';

import dynamic from 'next/dynamic';

const ConvertPage = dynamic(() => import('@/src/views/ConvertPage').then(mod => mod.ConvertPage), {
  ssr: false,
});

export default function Convert() {
  return <ConvertPage />;
}
