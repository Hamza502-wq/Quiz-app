'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlagStripe, LoadingBlock, LoginPage, Logo, appLinks, useAuth, type Profile } from '@doorstep/web-shared';
import { DEMO_MODE } from '@/lib/demo/mode';
import { WorkspaceChoices, workspacesFor } from '@/components/WorkspaceLinks';

/** Only allow same-site relative redirects after sign-in. */
function safeNext(value: string | null): string {
  // Browsers treat "/\host" like "//host", so backslashes are rejected too.
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.startsWith('/login')) return '/';
  return value;
}

export default function Login() {
  return (
    <Suspense fallback={<LoadingBlock variant="form" />}>
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
  // Riders, shop owners and admins choose where to go after signing in here.
  const [chooser, setChooser] = useState<Profile | null>(null);

  useEffect(() => {
    if (!loading && user && !signedInHere.current) router.replace(next);
  }, [loading, user, router, next]);

  if (chooser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo className="w-44" />
            <h1 className="mt-4 text-2xl font-bold">Welcome back{chooser.name ? `, ${chooser.name.split(' ')[0]}` : ''}</h1>
            <p className="mt-1 text-sm text-muted">Where would you like to go?</p>
            <FlagStripe className="mt-4" />
          </div>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <WorkspaceChoices workspaces={workspacesFor(chooser)} onShop={() => router.replace(next)} />
            <p className="mt-4 text-center text-xs text-muted">Each app asks you to sign in once with the same phone number and password.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LoginPage
      title="Sign in to DoorStep"
      subtitle="Order from local stores and track your delivery live."
      // The standalone demo signs in with its built-in SMS code only.
      allowSignup={!DEMO_MODE}
      modes={DEMO_MODE ? ['otp'] : undefined}
      signupNote={DEMO_MODE ? 'New here? Your account is created when you verify your number.' : undefined}
      initialView={params.get('signup') === '1' && !DEMO_MODE ? 'signup' : 'signin'}
      onSuccess={(u) => {
        signedInHere.current = true;
        // Accounts created with an SMS code add their name first.
        if (!u.name) router.replace(`/account?welcome=1&next=${encodeURIComponent(next)}`);
        // Signed in from the home page with a rider, shop or admin account: ask where to go.
        else if (next === '/' && workspacesFor(u).length > 0) setChooser(u);
        else router.replace(next);
      }}
      footer={
        <p className="text-center text-sm text-muted">
          Own a shop?{' '}
          <a href={appLinks.vendor} className="font-semibold text-brand hover:underline">
            Sell on DoorStep
          </a>
          {appLinks.rider ? (
            <>
              {' '}
              · Ride with us?{' '}
              <a href={appLinks.rider} className="font-semibold text-brand hover:underline">
                Become a rider
              </a>
            </>
          ) : null}
        </p>
      }
    />
  );
}
