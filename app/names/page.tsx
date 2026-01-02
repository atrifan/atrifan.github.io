'use client';

import dynamic from 'next/dynamic';

const NamesPage = dynamic(() => import('@/src/views/NamesPage').then(mod => mod.NamesPage), {
  ssr: false,
});

export default function Names() {
  return <NamesPage />;
}
