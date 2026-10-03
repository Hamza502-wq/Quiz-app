'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { VendorProfile } from '@doorstep/web-shared';

interface VendorContextValue {
  vendor: VendorProfile;
  setVendor: (v: VendorProfile) => void;
  reload: () => Promise<void>;
}

const VendorContext = createContext<VendorContextValue | null>(null);

export function VendorProvider({ value, children }: { value: VendorContextValue; children: ReactNode }) {
  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendor(): VendorContextValue {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error('useVendor must be used within the dashboard layout');
  return ctx;
}
