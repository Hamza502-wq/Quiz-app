'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingBlock, LoginPage, useAuth } from '@doorstep/web-shared';

/** Only allow same-site relative redirects after sign-in. */
function safeNext(value: string | null): string {
  // Browsers treat "/\host" like "//host", so backslashes are rejected too.
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.startsWith('/login')) return '/';
  return value;
}

export default function Login() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading } = useAuth();
  const next = safeNext(params.get('next'));
  // Set when this page signs the user in, so the "already signed in" redirect below doesn't race it.
  const signedInHere = useRef(false);

  useEffect(() => {
    if (!loading && user && !signedInHere.current) router.replace(next);
  }, [loading, user, router, next]);

  return (
    <LoginPage
      title="Sign in to DoorStep"
      subtitle="Order from local stores and track your delivery live."
      modes={['otp']}
      allowSignup
      signupNote="New here? Your account is created when you verify your number."
      onSuccess={(u) => {
        signedInHere.current = true;
        // New customers add their name first.
        router.replace(u.name ? next : `/account?welcome=1&next=${encodeURIComponent(next)}`);
      }}
    />
  );
}
