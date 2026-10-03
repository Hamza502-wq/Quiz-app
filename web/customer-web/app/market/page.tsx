'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BellPlus, Gavel, MapPin, Repeat, Search, Sparkles, Store, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingBlock, Select, api, cn, useApi, useAuth, useToast } from '@doorstep/web-shared';
import { MarketShell } from '@/components/market/MarketShell';
import { ListingGrid } from '@/components/market/ListingCard';
import { DeliverToModal } from '@/components/DeliverToModal';
import { useDeliverTo } from '@/lib/location';
import { SEARCH_EXAMPLES, SORT_LABEL, type ListingSummary, type MarketCategory, type SearchResult, type SearchSort } from '@/lib/market';

const PAGE_SIZE = 24;
const SORTS = Object.keys(SORT_LABEL) as SearchSort[];

export default function MarketPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="cards" />}>
      <MarketShell wide>
        <Market />
      </MarketShell>
    </Suspense>
  );
}

function Market() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const { deliverTo, ready: locationReady } = useDeliverTo();
  const [pickerOpen, setPickerOpen] = useState(false);

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const kindParam = params.get('kind');
  const kind = kindParam === 'ITEM' || kindParam === 'SERVICE' ? kindParam : '';
  const sortParam = params.get('sort') as SearchSort | null;
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : '';
  const auctions = params.get('auction') === '1';
  const swaps = params.get('swap') === '1';
  const near = params.get('near') === '1';

  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ListingSummary[]>([]);
  const [saving, setSaving] = useState(false);

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const filterKey = `${q}|${category}|${kind}|${sort}|${auctions}|${swaps}|${near}|${deliverTo?.lat}|${deliverTo?.lng}`;
  useEffect(() => setPage(1), [filterKey]);

  const categories = useApi<MarketCategory[]>('/market/categories');
  const query = useMemo(
    () => ({
      q: q || undefined,
      category: category || undefined,
      kind: kind || undefined,
      sort: sort || undefined,
      saleType: auctions ? 'AUCTION' : undefined,
      barter: swaps || undefined,
      nearMe: near || undefined,
      lat: deliverTo?.lat,
      lng: deliverTo?.lng,
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, category, kind, sort, auctions, swaps, near, deliverTo, page],
  );
  const results = useApi<SearchResult>(locationReady ? '/market/search' : null, query);
  useEffect(() => {
    const data = results.data;
    if (!data) return;
    setItems((prev) => (data.page === 1 ? data.items : [...prev, ...data.items.filter((l) => !prev.some((p) => p.id === l.id))]));
  }, [results.data]);
  const shown = results.data?.page === 1 ? results.data.items : items;
  const hasMore = results.data ? results.data.page < results.data.totalPages : false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParam({ q: draft.trim().slice(0, 200) || null });
  };

  const saveSearch = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`${pathname}?${params.toString()}`)}`);
      return;
    }
    setSaving(true);
    try {
      await api('/market/me/saved-searches', {
        body: {
          query: q || undefined,
          filters: {
            category: category || undefined,
            kind: kind || undefined,
            saleType: auctions ? 'AUCTION' : undefined,
            barter: swaps || undefined,
            nearMe: near || undefined,
          },
          lat: deliverTo?.lat,
          lng: deliverTo?.lng,
        },
      });
      toast(deliverTo ? 'Search saved. We’ll tell you when a match is posted near you.' : 'Search saved. We’ll tell you when a match is posted.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the search', 'error');
    } finally {
      setSaving(false);
    }
  };

  const visibleCategories = (categories.data ?? []).filter((c) => !kind || c.kind === kind);
  const interpretation = results.data?.interpretation ?? null;
  const filtersOn = Boolean(q || category || kind || auctions || swaps || near || sort);

  return (
    <div>
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark px-4 py-6 text-white sm:px-6 sm:py-8">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">DoorStep Market</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/90">Buy, sell, swap and bid with people and local vendors near you. Search the way you talk — in English or Shona.</p>
        <form onSubmit={submit} className="mt-4 flex max-w-2xl gap-2" role="search">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 text-ink shadow-lg">
            <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden />
            <input
              type="text"
              enterKeyHint="search"
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. cheapest plumber near me"
              className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
              aria-label="Search DoorStep Market"
            />
            {draft ? (
              <button type="button" onClick={() => { setDraft(''); setParam({ q: null }); }} className="rounded-full p-1 text-muted hover:bg-canvas" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <Button type="submit" variant="dark" size="lg" className="px-4" aria-label="Search" icon={<Search className="h-5 w-5" />}>
            <span className="hidden sm:inline">Search</span>
          </Button>
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-xs">
          {SEARCH_EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setParam({ q: ex })} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25">
              “{ex}”
            </button>
          ))}
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card" role="group" aria-label="Items or services">
          {[
            { v: '', label: 'All' },
            { v: 'ITEM', label: 'Items' },
            { v: 'SERVICE', label: 'Services' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={kind === o.v}
              onClick={() => setParam({ kind: o.v || null, category: null })}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', kind === o.v ? 'bg-brand text-white' : 'text-ink-soft hover:bg-canvas')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <FilterChip on={near} onClick={() => (deliverTo ? setParam({ near: near ? null : '1' }) : setPickerOpen(true))} icon={<MapPin className="h-4 w-4" aria-hidden />}>
          Near me
        </FilterChip>
        <FilterChip on={auctions} onClick={() => setParam({ auction: auctions ? null : '1', swap: null })} icon={<Gavel className="h-4 w-4" aria-hidden />}>
          Auctions
        </FilterChip>
        <FilterChip on={swaps} onClick={() => setParam({ swap: swaps ? null : '1', auction: null })} icon={<Repeat className="h-4 w-4" aria-hidden />}>
          Swaps
        </FilterChip>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="sr-only sm:not-sr-only sm:text-muted">Sort</span>
          <Select value={sort} onChange={(e) => setParam({ sort: e.target.value || null })} className="w-auto py-2" aria-label="Sort results">
            <option value="">{q ? 'As you asked' : 'Newest'}</option>
            {SORTS.map((s) => (
              <option key={s} value={s} disabled={s === 'nearest' && !deliverTo}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <CategoryChip label="All categories" active={!category} onClick={() => setParam({ category: null })} />
        {visibleCategories.map((c) => (
          <CategoryChip key={c.slug} label={c.name} title={c.shona} active={category === c.slug} onClick={() => setParam({ category: c.slug, kind: null })} />
        ))}
      </div>

      {results.data ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <p className="min-w-0 flex-1 text-ink-soft">
            {interpretation ? (
              <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
                <Sparkles className="h-3 w-3" aria-hidden /> {interpretation.language === 'sn' ? 'Ndanzwisisa' : 'Understood'}
              </span>
            ) : null}
            <span className="font-semibold text-ink">{results.data.summary}</span>
            <span className="text-muted">
              {' '}
              · {results.data.total} result{results.data.total === 1 ? '' : 's'}
              {results.data.radiusKm ? ` within ${results.data.radiusKm} km` : ''}
            </span>
          </p>
          {filtersOn ? (
            <Button variant="secondary" size="sm" loading={saving} onClick={() => void saveSearch()} icon={<BellPlus className="h-4 w-4" />}>
              Alert me
            </Button>
          ) : null}
        </div>
      ) : null}

      {results.data?.needsLocation ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-warning-light px-4 py-3 text-sm text-warning">
          <MapPin className="h-4 w-4" aria-hidden />
          <span className="flex-1">Set your location to see what is near you.</span>
          <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
            Set location
          </Button>
        </div>
      ) : null}
      {results.data?.widened ? <p className="mt-2 text-xs text-muted">Nothing within 15 km, so we looked up to 50 km away.</p> : null}

      <div className="mt-4">
        {results.error && !results.data ? (
          <ErrorState message={results.error.message} onRetry={() => void results.reload()} />
        ) : !results.data ? (
          <LoadingBlock label="Searching…" variant="cards" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Store className="h-9 w-9" aria-hidden />}
            title="Nothing found yet"
            message={filtersOn ? 'Try fewer words or another category — or tap “Alert me” and we’ll tell you when something is posted.' : 'Be the first to list something in your area.'}
            action={
              <Link href="/market/sell?new=1" className="font-semibold text-brand hover:underline">
                Sell something
              </Link>
            }
          />
        ) : (
          <>
            <ListingGrid items={shown} />
            {hasMore ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" loading={results.loading} onClick={() => setPage((p) => p + 1)}>
                  Show more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <DeliverToModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

function FilterChip({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors',
        on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-soft hover:border-brand',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function CategoryChip({ label, title, active, onClick }: { label: string; title?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-brand',
      )}
    >
      {label}
    </button>
  );
}
