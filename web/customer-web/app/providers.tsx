'use client';

import type { ReactNode } from 'react';
import { AuthProvider, MapsProvider, SocketProvider, ToastProvider, useAuth } from '@doorstep/web-shared';
import { CartProvider } from '@/lib/cart';
import { LocationProvider } from '@/lib/location';
import { SiteShell } from '@/components/SiteShell';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider role="CUSTOMER">
      <ToastProvider>
        <LocationProvider>
          <CartProvider>
            <MapsProvider>
              <RealtimeForSignedIn>
                <SiteShell>{children}</SiteShell>
              </RealtimeForSignedIn>
            </MapsProvider>
          </CartProvider>
        </LocationProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

/** Opens the Socket.IO connection only while a customer is signed in. */
function RealtimeForSignedIn({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <SocketProvider enabled={Boolean(user)}>{children}</SocketProvider>;
}
