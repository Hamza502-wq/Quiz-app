'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, MessageCircle, Repeat, Search, Store } from 'lucide-react';
import { EmptyState, cn, useApi, useAuth, useInterval, useSocketEvent } from '@doorstep/web-shared';
import { DEMO_MODE } from '@/lib/demo/mode';

const TABS = [
  { href: '/market', label: 'Browse', Icon: Search },
  { href: '/market/sell', label: 'Sell', Icon: Store },
  { href: '/market/messages', label: 'Messages', Icon: MessageCircle },
  { href: '/market/offers', label: 'Swaps', Icon: Repeat },
  { href: '/market/alerts', label: 'Alerts', Icon: Bell },
] as const;

/** Page frame for DoorStep Market: the section tabs and a width that works from phones up. */
export function MarketShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  if (DEMO_MODE) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          icon={<Store className="h-9 w-9" aria-hidden />}
          title="DoorStep Market is not in the demo"
          message="Buying, selling, swapping and auctions need the live DoorStep server. Try it on the full site."
          action={
            <Link href="/" className="font-semibold text-brand hover:underline">
              Back to stores
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className={cn('mx-auto px-4 py-4 sm:py-6', wide ? 'max-w-6xl' : 'max-w-4xl')}>
      <MarketTabs />
      {children}
    </div>
  );
}

function MarketTabs() {
  const pathname = usePathname();
  const { user } = useAuth();
  const unread = useApi<{ unread: number }>(user ? '/market/threads/unread' : null);
  const { reload } = unread;
  useInterval(() => void reload(), user ? 30_000 : null);
  useSocketEvent('market:message', () => void reload());
  const count = unread.data?.unread ?? 0;

  return (
    <nav aria-label="DoorStep Market" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === '/market' ? pathname === '/market' || pathname.startsWith('/market/listing') || pathname.startsWith('/market/seller') : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-canvas',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {href === '/market/messages' && count > 0 ? (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                  active ? 'bg-white text-brand' : 'bg-brand text-white',
                )}
                aria-label={`${count} unread`}
              >
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
