'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginPage, useAuth } from '@doorstep/web-shared';

export default function AdminLogin() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.roles.includes('ADMIN')) router.replace('/');
  }, [loading, user, router]);

  return <LoginPage title="Admin console" subtitle="DoorStep Zimbabwe operations" onSuccess={() => router.replace('/')} />;
}
