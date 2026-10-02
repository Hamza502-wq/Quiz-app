'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from './auth';
import { AppIcon, FlagStripe, Logo } from './brand';
import { config } from './config';
import { SocketProvider, useSocket } from './socket';
import { MapsProvider } from './maps';
import { InstallAppButton } from './pwa';
import { ChangePasswordButton } from './ChangePassword';
import { Button, LoadingBlock, cn } from './ui';
import type { RoleName } from './types';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/** Redirects to /login when signed out; blocks users without `role`. */
export function AuthGate({ role, children }: { role: RoleName; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Signing you in…" />
      </div>
    );
  }
  if (!user.roles.includes(role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <Logo className="w-40" />
        <p className="max-w-sm text-sm text-muted">
          This account ({user.phone}) doesn&apos;t have {role.toLowerCase()} access.
        </p>
        <Button variant="secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

function ConnectionDot() {
  const { connected } = useSocket();
  if (!config.realtime) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted" title="This page refreshes automatically">
        <span className="h-2 w-2 rounded-full bg-success" />
        Auto-refresh
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={connected ? 'Live updates on' : 'Reconnecting…'}>
      <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-success' : 'bg-warning animate-pulse')} />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

export function AppShell({
  nav,
  product,
  headerExtra,
  children,
}: {
  nav: NavItem[];
  product: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <Logo className="w-36" />
        <div className="mt-3 flex items-center gap-2">
          <FlagStripe className="w-8" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{product}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {nav.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive(item.href) ? 'bg-brand text-white shadow-sm' : 'text-ink-soft hover:bg-canvas hover:text-ink',
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-line p-4">
        <p className="truncate text-sm font-semibold">{user?.name ?? 'Signed in'}</p>
        <p className="truncate text-xs text-muted">{user?.phone}</p>
        <div className="mt-3 flex flex-col items-start gap-2 px-2 text-sm font-semibold text-brand">
          <ChangePasswordButton />
          <InstallAppButton appName={`DoorStep ${product}`} variant="link" />
        </div>
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start px-2" icon={<LogOut className="h-4 w-4" />} onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <SocketProvider enabled={Boolean(user)}>
      <MapsProvider>
        <div className="min-h-screen lg:flex">
          <aside className="hidden w-64 shrink-0 border-r border-line bg-white lg:block">
            <div className="sticky top-0 h-screen">{sidebar}</div>
          </aside>

          {open ? (
            <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
              <div className="absolute inset-0 bg-black/40" />
              <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="absolute right-3 top-3 rounded-lg p-1 text-muted" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
                {sidebar}
              </aside>
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
              <div className="flex items-center gap-3">
                <button type="button" className="rounded-lg p-1.5 text-ink lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                  <Menu className="h-6 w-6" />
                </button>
                <AppIcon className="h-8 w-8 lg:hidden" />
                <ConnectionDot />
              </div>
              <div className="flex items-center gap-3">{headerExtra}</div>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
          </div>
        </div>
      </MapsProvider>
    </SocketProvider>
  );
}
