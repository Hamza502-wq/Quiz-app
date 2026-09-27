'use client';

import type { ReactNode } from 'react';
import { BarChart3, Bike, ClipboardList, Map, Scale, Settings, Store, Users, Wallet } from 'lucide-react';
import { AppShell, AuthGate, type NavItem } from '@doorstep/web-shared';

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/live', label: 'Live map', icon: Map },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/vendors', label: 'Vendors', icon: Store },
  { href: '/riders', label: 'Riders', icon: Bike },
  { href: '/users', label: 'Customers & users', icon: Users },
  { href: '/disputes', label: 'Disputes & refunds', icon: Scale },
  { href: '/payouts', label: 'Payouts', icon: Wallet },
  { href: '/settings', label: 'Settings & zones', icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate role="ADMIN">
      <AppShell nav={NAV} product="Admin">
        {children}
      </AppShell>
    </AuthGate>
  );
}
