'use client';

import type { ReactNode } from 'react';
import { AuthProvider, ServiceWorkerRegistration, ToastProvider } from '@doorstep/web-shared';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider role="ADMIN">
      <ServiceWorkerRegistration />
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
