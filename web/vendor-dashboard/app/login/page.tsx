'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginPage, useAuth } from '@doorstep/web-shared';

export default function VendorLogin() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.roles.includes('VENDOR')) router.replace(user.vendor ? '/' : '/onboarding');
  }, [loading, user, router]);

  return (
    <LoginPage
      title="Vendor dashboard"
      subtitle="Manage your store, menu and orders"
      allowSignup
      onSuccess={(u) => router.replace(u.vendor ? '/' : '/onboarding')}
    />
  );
}
