'use client';

import type { ReactNode } from 'react';
import { AuthProvider, ToastProvider } from '@doorstep/web-shared';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider role="VENDOR">
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
