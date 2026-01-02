'use client';

import dynamic from 'next/dynamic';

const StackPage = dynamic(() => import('@/src/views/StackPage').then(mod => mod.StackPage), {
  ssr: false,
});

export default function Stack() {
  return <StackPage />;
}
