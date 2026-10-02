'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingBlock, LoginPage, appLinks, useAuth } from '@doorstep/web-shared';

export default function VendorLogin() {
  return (
    <Suspense fallback={<LoadingBlock variant="form" />}>
      <VendorLoginScreen />
    </Suspense>
  );
}

function VendorLoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.roles.includes('VENDOR')) router.replace(user.vendor ? '/' : '/onboarding');
  }, [loading, user, router]);

  return (
    <LoginPage
      title="Shop dashboard"
      subtitle="Manage your shop, products and orders on DoorStep"
      allowSignup
      signupTitle="Open your shop on DoorStep"
      signupNote="Next you'll add your shop details. We review new shops before they appear to customers."
      initialView={params.get('signup') === '1' ? 'signup' : 'signin'}
      onSuccess={(u) => router.replace(u.vendor ? '/' : '/onboarding')}
      footer={
        <p className="text-center text-sm text-muted">
          Looking to order?{' '}
          <a href={appLinks.customer} className="font-semibold text-brand hover:underline">
            Go to DoorStep
          </a>
        </p>
      }
    />
  );
}
