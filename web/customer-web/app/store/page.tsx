'use client';

import { Suspense, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Bike, Clock, Info, MapPin, Minus, Plus, Search, ShoppingBag } from 'lucide-react';
import {
  Badge,
  Button,
  DAY_NAMES,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  Pagination,
  cn,
  formatDate,
  formatMoney,
  useApi,
  type Paged,
  type Product,
} from '@doorstep/web-shared';
import { MAX_QUANTITY, useCart } from '@/lib/cart';
import { useDeliverTo } from '@/lib/location';
import { distanceLabel, etaLabel } from '@/lib/format';
import { harareWeekday, hoursLabel, todaysHours } from '@/lib/hours';
import type { Review, VendorMenu } from '@/lib/types';
import { CartPanel } from '@/components/CartPanel';
import { RatingPill, Stars, StoreCover, StoreLogo } from '@/components/StoreVisuals';

export default function StorePage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading the menu…" />}>
      <StoreLoader />
    </Suspense>
  );
}

function StoreLoader() {
  const slug = useSearchParams().get('slug') ?? '';
  const { deliverTo, ready } = useDeliverTo();
  const menu = useApi<VendorMenu>(ready && slug ? `/vendors/${encodeURIComponent(slug)}` : null, {
    lat: deliverTo?.lat,
    lng: deliverTo?.lng,
  });

  if (!slug || (menu.error && !menu.data && menu.error.status === 404)) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <EmptyState
          title="Store not found"
          message="This store may have closed down or changed its link."
          action={
            <Link href="/" className="font-semibold text-brand hover:underline">
              Browse stores
            </Link>
          }
        />
      </div>
    );
  }
  if (menu.error && !menu.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <ErrorState message={menu.error.message} onRetry={() => void menu.reload()} />
      </div>
    );
  }
  if (!menu.data) return <LoadingBlock label="Loading the menu…" />;
  return <Store menu={menu.data} />;
}

function Store({ menu }: { menu: VendorMenu }) {
  const { vendor, delivery, sections } = menu;
  const cart = useCart();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'menu' | 'reviews'>('menu');
  const [infoOpen, setInfoOpen] = useState(false);
  const [pending, setPending] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        products: s.products.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)),
      }))
      .filter((s) => s.products.length > 0);
  }, [sections, query]);

  const cartIsHere = cart.vendorId === vendor.id;
  const notDeliverable = delivery !== null && !delivery.deliverable;
  const canOrder = vendor.isOpen && !notDeliverable;
  const blockedReason = notDeliverable
    ? 'This store does not deliver to your location.'
    : !vendor.isOpen
      ? "This store is closed right now, so it can't take your order."
      : undefined;
  const cartVendor = { id: vendor.id, name: vendor.name, slug: vendor.slug };

  const addProduct = (p: Product, force = false) => {
    if (!force && cart.conflictsWith(vendor.id)) {
      setPending(p);
      return;
    }
    cart.add(cartVendor, { productId: p.id, name: p.name, priceCents: p.priceCents, thumbUrl: p.thumbUrl });
  };

  return (
    <div className="pb-24 lg:pb-0">
      <div className="relative">
        <StoreCover coverUrl={vendor.coverUrl} categorySlug={vendor.category?.slug} className="h-44 sm:h-56" />
        <Link
          href="/"
          className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All stores
        </Link>
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <div className="relative -mt-10 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card sm:flex-row sm:items-end">
          <StoreLogo logoUrl={vendor.logoUrl} name={vendor.name} className="h-20 w-20 -mt-14 sm:mt-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{vendor.name}</h1>
              {vendor.isOpen ? <Badge tone="green">Open</Badge> : <Badge tone="red">Closed</Badge>}
            </div>
            {vendor.description ? <p className="mt-1 text-sm text-muted">{vendor.description}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
              <RatingPill avg={vendor.ratingAvg} count={vendor.ratingCount} />
              {vendor.category ? <span>{vendor.category.name}</span> : null}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4 text-brand" aria-hidden /> Today {todaysHours(vendor.openingHours)}
              </span>
              {delivery ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Bike className="h-4 w-4 text-brand" aria-hidden /> {formatMoney(delivery.deliveryFeeCents)} delivery ·{' '}
                    {etaLabel(delivery.etaMinutes)}
                  </span>
                  <span>{distanceLabel(delivery.distanceKm)} away</span>
                </>
              ) : (
                <span>~{etaLabel(vendor.avgPrepMinutes)} prep</span>
              )}
              {vendor.minOrderCents > 0 ? <span>Minimum order {formatMoney(vendor.minOrderCents)}</span> : null}
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<Info className="h-4 w-4" />} onClick={() => setInfoOpen(true)}>
            Store info
          </Button>
        </div>

        {notDeliverable ? (
          <Notice>
            This store is too far from your delivery location. Choose a closer location at the top of the page.
          </Notice>
        ) : !vendor.isOpen ? (
          <Notice>
            {vendor.name} is closed right now. Today&apos;s hours: {todaysHours(vendor.openingHours)}. You can browse the menu and order when it opens.
          </Notice>
        ) : null}

        <div className="mt-6 flex gap-1 border-b border-line">
          {(['menu', 'reviews'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold capitalize',
                tab === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t === 'reviews' ? `Reviews (${vendor.ratingCount})` : 'Menu'}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            {tab === 'menu' ? (
              <>
                <div className="sticky top-16 z-20 -mx-4 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur">
                  <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3">
                    <Search className="h-4 w-4 text-muted" aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${vendor.name}`}
                      className="h-10 w-full bg-transparent text-sm outline-none"
                      aria-label="Search this menu"
                    />
                  </label>
                  {!query && sections.length > 1 ? (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {sections.map((s) => (
                        <a
                          key={s.id}
                          href={`#section-${s.id}`}
                          className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold hover:border-brand hover:text-brand"
                        >
                          {s.name}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>

                {sections.length === 0 ? (
                  <EmptyState title="No items yet" message="This store hasn't added its menu yet." />
                ) : filtered.length === 0 ? (
                  <EmptyState title={`Nothing matches “${query}”`} message="Try another word." />
                ) : (
                  <div className="space-y-8">
                    {filtered.map((s) => (
                      <section key={s.id} id={`section-${s.id}`} className="scroll-mt-36">
                        <h2 className="mb-3 text-lg font-bold">{s.name}</h2>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {s.products.map((p) => (
                            <ProductCard
                              key={p.id}
                              product={p}
                              quantity={cartIsHere ? cart.quantityOf(p.id) : 0}
                              disabled={!canOrder}
                              onAdd={() => addProduct(p)}
                              onSetQuantity={(q) => cart.setQuantity(p.id, q)}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Reviews vendorId={vendor.id} />
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-20">
              {cart.lines.length > 0 && !cartIsHere ? (
                <p className="mb-3 rounded-xl bg-brand-light px-3 py-2 text-xs text-brand-dark">
                  Your cart has items from {cart.vendorName}. Adding from {vendor.name} starts a new cart.
                </p>
              ) : null}
              <CartPanel
                compact
                minOrderCents={cartIsHere ? vendor.minOrderCents : undefined}
                blockedReason={cartIsHere ? blockedReason : undefined}
              />
            </div>
          </aside>
        </div>
      </div>

      {cart.ready && cart.itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 lg:hidden">
          <Link
            href="/cart"
            className="mx-auto flex h-12 max-w-xl items-center justify-between rounded-xl bg-brand px-4 font-semibold text-white"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" aria-hidden /> View cart · {cart.itemCount}
            </span>
            <span>{formatMoney(cart.subtotalCents)}</span>
          </Link>
        </div>
      ) : null}

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title={vendor.name}>
        <div className="space-y-4 text-sm">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-alert" aria-hidden />
            <div>
              <p className="font-semibold">{vendor.addressLine}</p>
              {vendor.landmark ? <p className="text-muted">{vendor.landmark}</p> : null}
              <p className="text-muted">{vendor.city}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 font-semibold">Opening hours (Harare time)</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {DAY_NAMES.map((day, i) => {
                const h = vendor.openingHours.find((x) => x.dayOfWeek === i);
                return (
                  <li key={day} className={cn('flex justify-between px-3 py-2', i === harareWeekday() && 'font-semibold text-brand')}>
                    <span>{day}</span>
                    <span>{hoursLabel(h)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-muted">Average preparation time: {etaLabel(vendor.avgPrepMinutes)}</p>
        </div>
      </Modal>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Start a new cart?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Keep current cart
            </Button>
            <Button
              onClick={() => {
                if (pending) addProduct(pending, true);
                setPending(null);
              }}
            >
              Start new cart
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Your cart has items from <strong className="text-ink">{cart.vendorName}</strong>. You can only order from one store at a time.
        </p>
      </Modal>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function ProductCard({
  product,
  quantity,
  disabled,
  onAdd,
  onSetQuantity,
}: {
  product: Product;
  quantity: number;
  disabled: boolean;
  onAdd: () => void;
  onSetQuantity: (q: number) => void;
}) {
  const soldOut = !product.isAvailable;
  const maxQty = product.stockQty !== null ? Math.min(MAX_QUANTITY, product.stockQty) : MAX_QUANTITY;
  return (
    <div className={cn('flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-card', soldOut && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{product.name}</p>
        {product.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{product.description}</p> : null}
        <p className="mt-2 text-sm font-bold">{formatMoney(product.priceCents)}</p>
        {product.stockQty !== null && product.stockQty > 0 && product.stockQty <= 5 ? (
          <p className="text-xs font-medium text-warning">Only {product.stockQty} left</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {product.thumbUrl || product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.thumbUrl ?? product.imageUrl ?? ''} alt="" className="h-20 w-20 rounded-xl object-cover" loading="lazy" />
        ) : null}
        {soldOut ? (
          <Badge>Sold out</Badge>
        ) : quantity > 0 ? (
          <div className="flex items-center rounded-xl bg-brand text-white">
            <button
              type="button"
              onClick={() => onSetQuantity(quantity - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-l-xl hover:bg-brand-dark"
              aria-label={`One less ${product.name}`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-sm font-bold">{quantity}</span>
            <button
              type="button"
              onClick={() => onSetQuantity(quantity + 1)}
              disabled={quantity >= maxQty}
              className="flex h-8 w-8 items-center justify-center rounded-r-xl hover:bg-brand-dark disabled:opacity-50"
              aria-label={`One more ${product.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onAdd} disabled={disabled} aria-label={`Add ${product.name} to cart`}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}

function Reviews({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const reviews = useApi<Paged<Review>>(`/vendors/${vendorId}/reviews`, { page, pageSize: 10 });
  if (reviews.error && !reviews.data) return <ErrorState message={reviews.error.message} onRetry={() => void reviews.reload()} />;
  if (!reviews.data) return <LoadingBlock label="Loading reviews…" />;
  if (reviews.data.items.length === 0) return <EmptyState title="No reviews yet" message="Be the first to order and leave a review." />;
  return (
    <div>
      <ul className="space-y-3">
        {reviews.data.items.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{r.customerName}</span>
              <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
            </div>
            <Stars score={r.score} className="mt-1" />
            {r.comment ? <p className="mt-2 text-sm text-ink-soft">{r.comment}</p> : null}
          </li>
        ))}
      </ul>
      <Pagination page={reviews.data.page} totalPages={reviews.data.totalPages} onChange={setPage} />
    </div>
  );
}

