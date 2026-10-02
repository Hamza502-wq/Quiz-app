'use client';

import { Bike, ChevronRight, ShieldCheck, ShoppingBag, Store } from 'lucide-react';
import { appLinks, cn, type Profile } from '@doorstep/web-shared';

export interface Workspace {
  key: 'RIDER' | 'VENDOR' | 'ADMIN';
  label: string;
  description: string;
  href: string;
  Icon: typeof Bike;
}

/**
 * The other DoorStep apps this account works in. Each app keeps its own sign-in, so riders,
 * shop owners and admins who sign in on the shopping site are pointed to theirs.
 */
export function workspacesFor(user: Pick<Profile, 'roles'> | null): Workspace[] {
  if (!user) return [];
  const list: Workspace[] = [];
  if (user.roles.includes('RIDER') && appLinks.rider) {
    list.push({ key: 'RIDER', label: 'Rider app', description: 'Go online, take deliveries and see your earnings.', href: appLinks.rider, Icon: Bike });
  }
  if (user.roles.includes('VENDOR')) {
    list.push({ key: 'VENDOR', label: 'Shop dashboard', description: 'Accept orders, choose riders and manage your products.', href: appLinks.vendor, Icon: Store });
  }
  if (user.roles.includes('ADMIN')) {
    list.push({ key: 'ADMIN', label: 'Admin panel', description: 'Approve riders and shops, watch orders and dispatch.', href: appLinks.admin, Icon: ShieldCheck });
  }
  return list;
}

/** Big tappable rows linking to each app, with ordering on this site as the last choice. */
export function WorkspaceChoices({ workspaces, onShop, className }: { workspaces: Workspace[]; onShop?: () => void; className?: string }) {
  const row = 'flex w-full items-center gap-3 rounded-xl border border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-light/30';
  return (
    <div className={cn('space-y-3', className)}>
      {workspaces.map(({ key, label, description, href, Icon }) => (
        <a key={key} href={href} className={row}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{label}</span>
            <span className="block text-sm text-muted">{description}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        </a>
      ))}
      {onShop ? (
        <button type="button" onClick={onShop} className={row}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Order as a customer</span>
            <span className="block text-sm text-muted">Shop from local stores or send a parcel.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
