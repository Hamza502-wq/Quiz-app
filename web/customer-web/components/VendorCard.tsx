import Link from 'next/link';
import { Bike, Clock } from 'lucide-react';
import { formatMoney } from '@doorstep/web-shared';
import { distanceLabel, etaLabel } from '@/lib/format';
import type { VendorSummary } from '@/lib/types';
import { RatingPill, StoreCover, StoreLogo } from './StoreVisuals';

export function VendorCard({ vendor }: { vendor: VendorSummary }) {
  const eta = vendor.etaMinutes ?? vendor.avgPrepMinutes;
  return (
    <Link
      href={`/store/${vendor.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-shadow hover:shadow-lg"
    >
      <StoreCover coverUrl={vendor.coverUrl} categorySlug={vendor.category?.slug} closed={!vendor.isOpen} className="h-36" />
      <div className="relative flex flex-1 flex-col gap-1.5 p-4 pt-3">
        <StoreLogo logoUrl={vendor.logoUrl} name={vendor.name} className="absolute -top-7 right-4 h-12 w-12" />
        <p className="pr-14 font-bold leading-tight group-hover:text-brand">{vendor.name}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <RatingPill avg={vendor.ratingAvg} count={vendor.ratingCount} />
          {vendor.category ? <span>{vendor.category.name}</span> : null}
          {vendor.distanceKm !== null ? <span>{distanceLabel(vendor.distanceKm)}</span> : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-medium text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-brand" aria-hidden />
            {vendor.etaMinutes !== null ? etaLabel(eta) : `${etaLabel(vendor.avgPrepMinutes)} prep`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bike className="h-3.5 w-3.5 text-brand" aria-hidden />
            {vendor.deliveryFeeCents !== null ? `${formatMoney(vendor.deliveryFeeCents)} delivery` : 'Fee at checkout'}
          </span>
          {vendor.minOrderCents > 0 ? <span>Min {formatMoney(vendor.minOrderCents)}</span> : null}
        </div>
      </div>
    </Link>
  );
}
