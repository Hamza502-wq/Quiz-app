'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ClipboardList, MapPin, Package, ShoppingBag, UserRound } from 'lucide-react';
import { FlagStripe, cn, useAuth } from '@doorstep/web-shared';
import { useCart } from '@/lib/cart';
import { useDeliverTo } from '@/lib/location';
import { DeliverToModal } from './DeliverToModal';

/** Public storefront chrome: header with delivery location, cart and account; footer. */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The sign-in page is a focused full-screen flow.
  if (pathname === '/login') return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const { user, loading } = useAuth();
  const { itemCount, ready } = useCart();
  const { deliverTo } = useDeliverTo();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pathname = usePathname();

  const navLink = (href: string, label: string, Icon: typeof Package) => (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
        pathname.startsWith(href) ? 'text-brand' : 'text-ink-soft hover:bg-canvas hover:text-ink',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="shrink-0" aria-label="DoorStep Zimbabwe home">
          {/* Sized by height so the logo always fits inside the header bar. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DoorStep Zimbabwe" className="h-12 w-auto sm:h-14" />
        </Link>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-canvas sm:px-3"
        >
          <MapPin className="h-4 w-4 shrink-0 text-alert" aria-hidden />
          <span className="min-w-0">
            <span className="hidden text-xs text-muted sm:block">Deliver to</span>
            <span className="block max-w-[6.5rem] truncate font-semibold sm:max-w-[14rem]">{deliverTo?.label ?? 'Set your location'}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </button>

        <nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {navLink('/parcel', 'Send a parcel', Package)}
          {user ? navLink('/orders', 'Orders', ClipboardList) : null}
          <Link
            href="/cart"
            className="relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-canvas hover:text-ink"
            aria-label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            <span className="hidden md:inline">Cart</span>
            {ready && itemCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            ) : null}
          </Link>
          {loading ? (
            <span className="h-9 w-20" aria-hidden />
          ) : user ? (
            navLink('/account', user.name?.split(' ')[0] ?? 'Account', UserRound)
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="ml-1 whitespace-nowrap rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark sm:px-4"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
      <DeliverToModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 bg-ink text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold">
            Door<span className="text-brand">Step</span> Zimbabwe
          </p>
          <p className="mt-2 text-sm text-white/70">Food, groceries, pharmacy and parcels — delivered to your door.</p>
          <FlagStripe className="mt-4" />
        </div>
        <div className="text-sm">
          <p className="font-semibold">Order</p>
          <ul className="mt-2 space-y-1.5 text-white/70">
            <li>
              <Link href="/" className="hover:text-white">
                Browse stores
              </Link>
            </li>
            <li>
              <Link href="/parcel" className="hover:text-white">
                Send a parcel
              </Link>
            </li>
            <li>
              <Link href="/orders" className="hover:text-white">
                Track an order
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-semibold">Pay your way</p>
          <p className="mt-2 text-white/70">EcoCash · OneMoney · Card · Cash on delivery</p>
          <p className="mt-1 text-white/70">Prices in US dollars or ZiG</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} DoorStep Zimbabwe</div>
    </footer>
  );
}
