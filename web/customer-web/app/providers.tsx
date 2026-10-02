'use client';

import type { ReactNode } from 'react';
import { AuthProvider, MapsProvider, ServiceWorkerRegistration, SocketProvider, ToastProvider, useAuth } from '@doorstep/web-shared';
import { CartProvider } from '@/lib/cart';
import { LocationProvider } from '@/lib/location';
import { SiteShell } from '@/components/SiteShell';
import { DEMO_MODE } from '@/lib/demo/mode';
import { installDemoApi } from '@/lib/demo/server';

// Standalone demo builds answer API calls in the browser; install before any request is made.
if (DEMO_MODE) installDemoApi();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider role="CUSTOMER">
      <ServiceWorkerRegistration />
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

/** Opens the Socket.IO connection only while a customer is signed in (never in the demo, which polls). */
function RealtimeForSignedIn({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <SocketProvider enabled={Boolean(user) && !DEMO_MODE}>{children}</SocketProvider>;
}
