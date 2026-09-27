'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, ClipboardList, Home, Store, UtensilsCrossed, Wallet } from 'lucide-react';
import {
  ApiError,
  AppShell,
  AuthGate,
  Badge,
  ErrorState,
  LoadingBlock,
  Toggle,
  api,
  useToast,
  type NavItem,
  type VendorProfile,
} from '@doorstep/web-shared';
import { VendorProvider } from '@/components/VendorContext';

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: Home },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/menu', label: 'Menu & stock', icon: UtensilsCrossed },
  { href: '/store', label: 'Store profile', icon: Store },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/payouts', label: 'Payouts', icon: Wallet },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate role="VENDOR">
      <VendorShell>{children}</VendorShell>
    </AuthGate>
  );
}

function VendorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setVendor(await api<VendorProfile>('/vendor/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        router.replace('/onboarding');
        return;
      }
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not load your store'));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <ErrorState message={error.message} onRetry={() => void load()} />
      </div>
    );
  }
  if (!vendor) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Loading your store…" />
      </div>
    );
  }

  const toggleAccepting = async (value: boolean) => {
    setToggling(true);
    try {
      setVendor(await api<VendorProfile>('/vendor/me', { method: 'PATCH', body: { isAcceptingOrders: value } }));
      toast(value ? 'You are accepting orders' : 'Store paused — customers see you as closed', value ? 'success' : 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update', 'error');
    } finally {
      setToggling(false);
    }
  };

  const header = (
    <>
      <span className="hidden text-sm font-semibold sm:inline">{vendor.name}</span>
      {vendor.status !== 'APPROVED' ? (
        <Badge tone={vendor.status === 'PENDING' ? 'yellow' : 'red'}>{vendor.status === 'PENDING' ? 'Awaiting approval' : vendor.status}</Badge>
      ) : (
        <Badge tone={vendor.isOpen ? 'green' : 'gray'}>{vendor.isOpen ? 'Open' : 'Closed'}</Badge>
      )}
      <Toggle checked={vendor.isAcceptingOrders} onChange={(v) => void toggleAccepting(v)} disabled={toggling} label="Accepting orders" />
    </>
  );

  return (
    <VendorProvider value={{ vendor, setVendor, reload: load }}>
      <AppShell nav={NAV} product="Vendor" headerExtra={header}>
        {vendor.status === 'PENDING' ? (
          <div className="mb-6 rounded-2xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-ink">
            <strong>Your store is under review.</strong> Set up your menu and opening hours now — you&apos;ll be visible to customers as soon as the
            DoorStep team approves you.
          </div>
        ) : null}
        {vendor.status === 'SUSPENDED' || vendor.status === 'REJECTED' ? (
          <div className="mb-6 rounded-2xl border border-alert/30 bg-alert-light px-4 py-3 text-sm text-ink">
            <strong>Your store is {vendor.status.toLowerCase()}.</strong> Customers can&apos;t see it. Please contact DoorStep support.
          </div>
        ) : null}
        {children}
      </AppShell>
    </VendorProvider>
  );
}
