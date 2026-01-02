'use client';

import dynamic from 'next/dynamic';

const SpinPage = dynamic(() => import('@/src/views/SpinPage').then(mod => mod.SpinPage), {
  ssr: false,
});

export default function Spin() {
  return <SpinPage />;
}
