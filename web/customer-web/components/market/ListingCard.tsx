'use client';

import Link from 'next/link';
import { Gavel, ImageIcon, MapPin, Repeat, Timer, Wrench } from 'lucide-react';
import { Badge, cn } from '@doorstep/web-shared';
import { Photo } from '@/components/Photo';
import { distanceLabel } from '@/lib/format';
import { CONDITION_LABEL, countdownLabel, listingHref, priceLabel, useCountdown, type AuctionState, type ListingSummary } from '@/lib/market';

/** Live "time left" for an auction; turns red in the last hour. */
export function AuctionCountdown({ auction, skewMs = 0, className }: { auction: AuctionState; skewMs?: number; className?: string }) {
  const left = useCountdown(auction.ended ? null : auction.endsAt, skewMs);
  const ended = auction.ended || left === 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold tabular-nums',
        ended ? 'text-muted' : left !== null && left < 60 * 60_000 ? 'text-alert' : 'text-ink',
        className,
      )}
      aria-live="off"
    >
      <Timer className="h-3.5 w-3.5" aria-hidden />
      {ended ? 'Ended' : `${countdownLabel(left)} left`}
    </span>
  );
}

/** A photo placeholder for listings without one (services often have none). */
function NoPhoto({ service }: { service: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-brand-light text-brand">
      {service ? <Wrench className="h-10 w-10" aria-hidden /> : <ImageIcon className="h-10 w-10" aria-hidden />}
    </div>
  );
}

export function ListingThumb({ listing, className }: { listing: Pick<ListingSummary, 'thumbUrl' | 'title' | 'kind'>; className?: string }) {
  return (
    <div className={cn('overflow-hidden bg-canvas', className)}>
      {listing.thumbUrl ? (
        <Photo src={listing.thumbUrl} alt={listing.title} className="h-full w-full object-cover" fallback={<NoPhoto service={listing.kind === 'SERVICE'} />} />
      ) : (
        <NoPhoto service={listing.kind === 'SERVICE'} />
      )}
    </div>
  );
}

/** A listing in search results, storefronts and alerts. */
export function ListingCard({ listing }: { listing: ListingSummary }) {
  const sold = listing.status === 'SOLD';
  return (
    <Link
      href={listingHref(listing.id)}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-colors hover:border-brand"
    >
      <div className="relative">
        <ListingThumb listing={listing} className="aspect-[4/3] w-full" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {listing.saleType === 'AUCTION' ? (
            <Badge tone="dark">
              <Gavel className="h-3 w-3" aria-hidden /> Auction
            </Badge>
          ) : null}
          {listing.openToBarter ? (
            <Badge tone="green">
              <Repeat className="h-3 w-3" aria-hidden /> Swaps OK
            </Badge>
          ) : null}
          {sold ? <Badge tone="red">Sold</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-brand">{listing.title}</p>
        <p className="mt-1 text-base font-bold text-ink">
          {priceLabel(listing)}
          {listing.saleType === 'AUCTION' && listing.auction ? (
            <span className="ml-1 text-xs font-medium text-muted">
              {listing.auction.bidCount === 0 ? 'starting bid' : `${listing.auction.bidCount} bid${listing.auction.bidCount === 1 ? '' : 's'}`}
            </span>
          ) : null}
        </p>
        {listing.saleType === 'AUCTION' && listing.auction ? <AuctionCountdown auction={listing.auction} className="mt-0.5 text-xs" /> : null}
        <div className="mt-auto pt-2 text-xs text-muted">
          <p className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">
              {listing.area}
              {listing.distanceKm !== null ? ` · ${distanceLabel(listing.distanceKm)}` : ''}
            </span>
          </p>
          <p className="mt-0.5 truncate">
            {listing.kind === 'SERVICE' ? 'Service' : listing.condition ? CONDITION_LABEL[listing.condition] : listing.categoryName} · {listing.seller.displayName}
          </p>
        </div>
      </div>
    </Link>
  );
}

/** Responsive grid: two columns on phones, up to four on wide screens. */
export function ListingGrid({ items }: { items: ListingSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((l) => (
        <li key={l.id} className="flex min-w-0">
          <ListingCard listing={l} />
        </li>
      ))}
    </ul>
  );
}
