'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Bike, MapPin, Package, Search, Smartphone, Store } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  FlagStripe,
  LoadingBlock,
  Select,
  Toggle,
  cn,
  useApi,
  type Paged,
} from '@doorstep/web-shared';
import { useDeliverTo } from '@/lib/location';
import type { Category, VendorSummary } from '@/lib/types';
import { VendorCard } from '@/components/VendorCard';
import { CategoryIcon } from '@/components/StoreVisuals';
import { DeliverToModal } from '@/components/DeliverToModal';

const PAGE_SIZE = 12;
type Sort = 'recommended' | 'rating' | 'distance' | 'deliveryFee';
const SORTS: Sort[] = ['recommended', 'rating', 'distance', 'deliveryFee'];

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { deliverTo, ready: locationReady } = useDeliverTo();
  const [pickerOpen, setPickerOpen] = useState(false);

  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const openNow = params.get('open') === '1';
  const sortParam = params.get('sort') as Sort | null;
  const sort: Sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'recommended';
  // Distance-based sorting needs a location.
  const effectiveSort: Sort = !deliverTo && (sort === 'distance' || sort === 'deliveryFee') ? 'recommended' : sort;

  const [search, setSearch] = useState(q);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<VendorSummary[]>([]);

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounced search box → URL.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => setParam({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Keep the box in sync with back/forward navigation.
  useEffect(() => setSearch(q), [q]);

  // Start over at page 1 whenever the filters change.
  const filterKey = `${category}|${q}|${openNow}|${effectiveSort}|${deliverTo?.lat}|${deliverTo?.lng}`;
  useEffect(() => setPage(1), [filterKey]);

  const categories = useApi<Category[]>('/categories');
  const query = useMemo(
    () => ({
      category: category || undefined,
      q: q || undefined,
      openNow: openNow || undefined,
      sort: effectiveSort,
      lat: deliverTo?.lat,
      lng: deliverTo?.lng,
      page,
      pageSize: PAGE_SIZE,
    }),
    [category, q, openNow, effectiveSort, deliverTo, page],
  );
  // Wait for the saved location so the first request already includes it.
  const vendors = useApi<Paged<VendorSummary>>(locationReady ? '/vendors' : null, query);
  // Page 1 replaces the list; later pages append ("Show more").
  useEffect(() => {
    const data = vendors.data;
    if (!data) return;
    setItems((prev) =>
      data.page === 1 ? data.items : [...prev, ...data.items.filter((v) => !prev.some((p) => p.id === v.id))],
    );
  }, [vendors.data]);
  const hasMore = vendors.data ? vendors.data.page < vendors.data.totalPages : false;
  // Page 1 renders straight from the response so the list never flashes empty.
  const shown = vendors.data?.page === 1 ? vendors.data.items : items;
  const shopCategories = (categories.data ?? []).filter((c) => c.slug !== 'parcels');

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-dark text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:py-16">
          <div>
            <FlagStripe className="mb-5 h-1.5 w-20" />
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">Your local stores, delivered to your door.</h1>
            <p className="mt-4 max-w-xl text-white/90">
              Food, groceries and pharmacy from stores near you, plus parcels across town. Pay with EcoCash, OneMoney, card or cash.
            </p>
            <div className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
              <label className="flex flex-1 items-center gap-2 rounded-xl bg-white px-3 text-ink shadow-lg">
                <Search className="h-5 w-5 text-muted" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stores or dishes, e.g. sadza, pizza"
                  className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted"
                  aria-label="Search stores and products"
                />
              </label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold hover:bg-black"
              >
                <MapPin className="h-4 w-4 text-brand" aria-hidden />
                <span className="max-w-[12rem] truncate">{deliverTo ? deliverTo.label : 'Set delivery location'}</span>
              </button>
            </div>
          </div>
          <div className="hidden justify-center md:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="h-56 w-56 rounded-[2.5rem] shadow-2xl" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <div className="relative z-10 -mt-6 flex gap-2 overflow-x-auto pb-2 pt-1">
          <CategoryChip label="All stores" active={!category} onClick={() => setParam({ category: null })} />
          {shopCategories.map((c) => (
            <CategoryChip key={c.id} label={c.name} slug={c.slug} active={category === c.slug} onClick={() => setParam({ category: c.slug })} />
          ))}
          <Link
            href="/parcel"
            className="flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold shadow-card hover:border-brand"
          >
            <Package className="h-5 w-5 text-brand" aria-hidden /> Send a parcel
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {q ? `Results for “${q}”` : category ? (shopCategories.find((c) => c.slug === category)?.name ?? 'Stores') : 'Stores near you'}
            </h2>
            {!deliverTo ? (
              <p className="text-sm text-muted">
                <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setPickerOpen(true)}>
                  Set your location
                </button>{' '}
                to see delivery fees and times.
              </p>
            ) : vendors.data ? (
              <p className="text-sm text-muted">
                {vendors.data.total} store{vendors.data.total === 1 ? '' : 's'} deliver to {deliverTo.label}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <div className="shrink-0 whitespace-nowrap">
              <Toggle checked={openNow} onChange={(v) => setParam({ open: v ? '1' : null })} label="Open now" />
            </div>
            <Select
              value={effectiveSort}
              onChange={(e) => setParam({ sort: e.target.value === 'recommended' ? null : e.target.value })}
              className="w-44"
              aria-label="Sort stores"
            >
              <option value="recommended">Recommended</option>
              <option value="rating">Top rated</option>
              <option value="distance" disabled={!deliverTo}>
                Nearest
              </option>
              <option value="deliveryFee" disabled={!deliverTo}>
                Lowest delivery fee
              </option>
            </Select>
          </div>
        </div>

        <div className="mt-5">
          {vendors.error && !vendors.data ? (
            <ErrorState message={vendors.error.message} onRetry={() => void vendors.reload()} />
          ) : !vendors.data ? (
            <LoadingBlock label="Finding stores…" />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<Store className="h-9 w-9" aria-hidden />}
              title="No stores found"
              message={
                q || category || openNow
                  ? 'Try a different search or clear the filters.'
                  : deliverTo
                    ? 'No stores deliver to this location yet. Try another address.'
                    : 'No stores are available right now.'
              }
              action={
                q || category || openNow ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('');
                      setParam({ q: null, category: null, open: null });
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3', vendors.loading && 'opacity-70 transition-opacity')}>
                {shown.map((v) => (
                  <VendorCard key={v.id} vendor={v} />
                ))}
              </div>
              {hasMore ? (
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" loading={vendors.loading} onClick={() => setPage(vendors.data!.page + 1)}>
                    Show more stores
                  </Button>
                </div>
              ) : null}
              {vendors.error ? <p className="mt-3 text-center text-sm text-alert">{vendors.error.message}</p> : null}
            </>
          )}
        </div>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          <HowItWorks icon={<Store className="h-6 w-6" />} title="Pick a store" text="Browse restaurants, grocers and pharmacies that deliver to you." />
          <HowItWorks
            icon={<Smartphone className="h-6 w-6" />}
            title="Pay your way"
            text="EcoCash, OneMoney, card or cash on delivery — in US dollars or ZiG."
          />
          <HowItWorks icon={<Bike className="h-6 w-6" />} title="Track it live" text="Follow your rider on the map and share your delivery PIN at the door." />
        </section>

        <section className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="text-xl font-bold">Need something taken across town?</h2>
            <p className="mt-1 text-sm text-white/70">A DoorStep rider collects your parcel and delivers it the same day.</p>
          </div>
          <Link href="/parcel" className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold hover:bg-brand-dark">
            Send a parcel <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </div>

      <DeliverToModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

function CategoryChip({ label, slug, active, onClick }: { label: string; slug?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-card transition-colors',
        active ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand',
      )}
    >
      {slug ? <CategoryIcon slug={slug} className={cn('h-5 w-5', active ? 'text-white' : 'text-brand')} /> : <Store className={cn('h-5 w-5', active ? 'text-white' : 'text-brand')} aria-hidden />}
      {label}
    </button>
  );
}

function HowItWorks({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">{icon}</div>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

