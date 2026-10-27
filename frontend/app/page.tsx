'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from './lib/api';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => router.replace(getUser() ? '/dashboard' : '/login'), [router]);
  return <div className="loading">Tizim yuklanmoqda…</div>;
}
