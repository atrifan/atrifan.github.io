'use client';

import dynamic from 'next/dynamic';

const NotFoundPage = dynamic(() => import('@/src/views/NotFoundPage').then(mod => mod.NotFoundPage), {
  ssr: false,
});

export default function NotFound() {
  return <NotFoundPage />;
}
