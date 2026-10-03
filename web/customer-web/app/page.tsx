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
  appLinks,
  cn,
  useApi,
  type Paged,
} from '@doorstep/web-shared';
import { useDeliverTo } from '@/lib/location';
import type { Category, VendorSummary } from '@/lib/types';
import { VendorCard } from '@/components/VendorCard';
import { CategoryIcon } from '@/components/StoreVisuals';
import { DeliverToModal } from '@/components/DeliverToModal';
import { Photo } from '@/components/Photo';
import { PHOTOS } from '@/lib/photos';
import { DEMO_MODE } from '@/lib/demo/mode';

const PAGE_SIZE = 12;
type Sort = 'recommended' | 'rating' | 'distance' | 'deliveryFee';
const SORTS: Sort[] = ['recommended', 'rating', 'distance', 'deliveryFee'];

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingBlock variant="cards" />}>
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
  const [heroPhotoFailed, setHeroPhotoFailed] = useState(false);

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
  // Every kind of shop, beyond the photo tiles (electronics, clothing, hardware, …).
  const moreShops = shopCategories.filter((c) => !CATEGORY_TILES.some((t) => t.slug === c.slug));

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-dark text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:py-16">
          <div>
            <FlagStripe className="mb-5 h-1.5 w-20" />
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">Your local stores, delivered to your door.</h1>
            <p className="mt-4 max-w-xl text-white/90">
              Food, groceries, medicine, phones, clothes and more from shops near you, plus parcels across town. Pay with EcoCash,
              OneMoney, card or cash.
            </p>
            <div className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
              <label className="flex flex-1 items-center gap-2 rounded-xl bg-white px-3 text-ink shadow-lg">
                <Search className="h-5 w-5 text-muted" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search shops or products, e.g. sadza, phone charger"
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
          <div className="relative hidden justify-center md:flex">
            <Photo
              src={PHOTOS.hero}
              alt="A table of freshly prepared food"
              className="aspect-[4/3] w-full max-w-sm rotate-2 rounded-[2rem] border-4 border-white/80 object-cover shadow-2xl"
              onFailed={() => setHeroPhotoFailed(true)}
              fallback={
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/icon.png" alt="" className="h-56 w-56 rounded-[2.5rem] shadow-2xl" />
              }
            />
            {heroPhotoFailed ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/icon.png" alt="" className="absolute -bottom-4 left-4 h-20 w-20 rounded-2xl shadow-xl" />
            )}
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
          {DEMO_MODE ? null : (
            <Link
              href="/market"
              className="flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold shadow-card hover:border-brand"
            >
              <Store className="h-5 w-5 text-brand" aria-hidden /> Market: buy, sell &amp; swap
            </Link>
          )}
        </div>

        {!q && !category ? (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Shop by category">
              {CATEGORY_TILES.map((tile) =>
                tile.slug === 'parcels' ? (
                  <Link key={tile.slug} href="/parcel" className="group">
                    <PhotoTile {...tile} />
                  </Link>
                ) : (
                  <button key={tile.slug} type="button" className="group text-left" onClick={() => setParam({ category: tile.slug })}>
                    <PhotoTile {...tile} />
                  </button>
                ),
              )}
            </section>
            {moreShops.length > 0 ? (
              <section className="mt-6" aria-labelledby="more-shops">
                <h2 id="more-shops" className="text-base font-bold">
                  More shops
                </h2>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
                  {moreShops.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setParam({ category: c.slug })}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-2 py-4 text-center text-xs font-semibold shadow-card transition-colors hover:border-brand"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
                        <CategoryIcon slug={c.slug} className="h-6 w-6" />
                      </span>
                      <span className="leading-tight">{c.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <LoadingBlock label="Finding stores…" variant="cards" />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<Store className="h-9 w-9" aria-hidden />}
              title={q || category || openNow ? 'No stores found' : 'No shops here yet'}
              message={
                q || category || openNow
                  ? 'Try a different search or clear the filters.'
                  : deliverTo
                    ? 'No shops deliver to this location yet. Know a great local shop? Invite them to join DoorStep.'
                    : 'Shops are joining DoorStep every day. Own one? List it and start receiving orders.'
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
                ) : (
                  <a href={`${appLinks.vendor}login?signup=1`} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
                    List your shop <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                )
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
          <HowItWorks icon={<Store className="h-6 w-6" />} title="Pick a store" text="Browse restaurants, grocers, pharmacies and all kinds of shops that deliver to you." />
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

        <section className="mt-10 grid gap-5 md:grid-cols-2" aria-label="Work with DoorStep">
          <JoinCard
            photo={PHOTOS.shopOwner}
            icon={<Store className="h-6 w-6" />}
            title="Sell on DoorStep"
            text="List any shop (a restaurant, grocery, pharmacy, phone or clothing shop, hardware store…) and reach customers across town. Manage orders and your products from any phone."
            cta="List your shop"
            href={`${appLinks.vendor}login?signup=1`}
          />
          {appLinks.rider ? (
            <JoinCard
              photo={PHOTOS.rider}
              icon={<Bike className="h-6 w-6" />}
              title="Ride with DoorStep"
              text="Deliver orders on your own schedule. Go online when you want, see your earnings and get paid weekly."
              cta="Become a rider"
              href={appLinks.rider}
            />
          ) : null}
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

const CATEGORY_TILES = [
  { slug: 'food', title: 'Food', text: 'Restaurants & takeaways', photo: PHOTOS.food },
  { slug: 'groceries', title: 'Groceries', text: 'Fresh produce & essentials', photo: PHOTOS.groceries },
  { slug: 'pharmacy', title: 'Pharmacy', text: 'Medicine & health', photo: PHOTOS.pharmacy },
  // A branded tile rather than a stock photo.
  { slug: 'parcels', title: 'Parcels', text: 'Send anything across town', photo: null },
];

function PhotoTile({ slug, title, text, photo }: { slug: string; title: string; text: string; photo: string | null }) {
  const branded = (
    <div className="flex h-full w-full items-start justify-end p-4">
      <CategoryIcon slug={slug} className="h-10 w-10 text-white/80 sm:h-12 sm:w-12" />
    </div>
  );
  return (
    <div className="relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark shadow-card sm:h-44">
      {photo ? (
        <Photo
          src={photo}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          fallback={branded}
        />
      ) : (
        branded
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
        <p className="text-base font-bold sm:text-lg">{title}</p>
        <p className="text-xs text-white/85">{text}</p>
      </div>
    </div>
  );
}

function JoinCard({ photo, icon, title, text, cta, href }: { photo: string; icon: ReactNode; title: string; text: string; cta: string; href: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card sm:flex-row">
      <div className="h-44 shrink-0 bg-gradient-to-br from-brand to-brand-dark sm:h-auto sm:w-2/5">
        <Photo
          src={photo}
          className="h-full w-full object-cover"
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="" className="h-20 w-20 rounded-2xl shadow-lg" />
            </div>
          }
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">{icon}</div>
        <h3 className="mt-3 text-lg font-bold">{title}</h3>
        <p className="mt-1 flex-1 text-sm text-muted">{text}</p>
        <a href={href} className="mt-4 inline-flex items-center gap-2 self-start rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black">
          {cta} <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
