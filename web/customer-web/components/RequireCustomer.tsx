'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, LoadingBlock, useAuth } from '@doorstep/web-shared';

/** Sends signed-out visitors to /login (and back here afterwards). */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const next = `${pathname}${typeof window === 'undefined' ? '' : window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) return <LoadingBlock label="Checking your account…" />;
  if (!user.roles.includes('CUSTOMER')) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
        <p className="text-sm text-muted">This account is not set up for ordering. Sign in with your customer phone number.</p>
        <Button variant="secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
