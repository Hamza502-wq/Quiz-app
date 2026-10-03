'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Bell, BellRing, MapPin, Search, Store, Trash2, UserMinus } from 'lucide-react';
import { Avatar, Button, EmptyState, ErrorState, LoadingBlock, api, timeAgo, useApi, useToast } from '@doorstep/web-shared';
import { RequireCustomer } from '@/components/RequireCustomer';
import { MarketShell } from '@/components/market/MarketShell';
import { ListingThumb } from '@/components/market/ListingCard';
import { listingHref, priceLabel, sellerHref, type FollowedSeller, type MarketAlert, type SavedSearch } from '@/lib/market';

export default function AlertsPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="list" />}>
      <MarketShell>
        <RequireCustomer>
          <Alerts />
        </RequireCustomer>
      </MarketShell>
    </Suspense>
  );
}

function Alerts() {
  const toast = useToast();
  const alerts = useApi<MarketAlert[]>('/market/me/alerts');
  const saved = useApi<SavedSearch[]>('/market/me/saved-searches');
  const following = useApi<FollowedSeller[]>('/market/me/following');
  const [busy, setBusy] = useState<string | null>(null);

  const removeSearch = async (s: SavedSearch) => {
    setBusy(s.id);
    try {
      await api(`/market/me/saved-searches/${s.id}`, { method: 'DELETE' });
      saved.setData((prev) => (prev ?? []).filter((x) => x.id !== s.id));
      toast('Saved search deleted');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const unfollow = async (f: FollowedSeller) => {
    setBusy(f.id);
    try {
      await api(`/market/sellers/${f.id}/follow`, { method: 'DELETE' });
      following.setData((prev) => (prev ?? []).filter((x) => x.id !== f.id));
      toast(`Unfollowed ${f.displayName}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Smart alerts</h1>
        <p className="mt-1 text-sm text-muted">
          Follow sellers and save searches. When a matching item is posted near you, we send you a notification.
        </p>
      </div>

      <section aria-labelledby="recent-alerts">
        <h2 id="recent-alerts" className="mb-2 flex items-center gap-2 text-base font-bold">
          <BellRing className="h-5 w-5 text-brand" aria-hidden /> Latest matches
        </h2>
        {alerts.error && !alerts.data ? (
          <ErrorState message={alerts.error.message} onRetry={() => void alerts.reload()} />
        ) : !alerts.data ? (
          <LoadingBlock label="Loading alerts…" variant="list" />
        ) : alerts.data.length === 0 ? (
          <EmptyState icon={<Bell className="h-9 w-9" aria-hidden />} title="No alerts yet" message="Save a search or follow a seller below. New matches show up here." />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            {alerts.data.map((a) => (
              <li key={a.id}>
                {a.listing ? (
                  <Link href={listingHref(a.listing.id)} className="flex items-center gap-3 p-3 hover:bg-canvas">
                    <ListingThumb listing={a.listing} className="h-14 w-14 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-brand">{a.title}</p>
                      <p className="truncate text-sm font-semibold">{a.listing.title}</p>
                      <p className="truncate text-xs text-muted">
                        {priceLabel(a.listing)} · {a.listing.area} · {timeAgo(a.createdAt)}
                        {a.listing.status === 'SOLD' ? ' · sold' : ''}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <div className="p-3 text-sm text-muted">
                    <p className="font-semibold text-ink">{a.title}</p>
                    <p>{a.body} · no longer listed</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="saved-searches">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="saved-searches" className="flex items-center gap-2 text-base font-bold">
            <Search className="h-5 w-5 text-brand" aria-hidden /> Saved searches
          </h2>
          <Link href="/market" className="text-sm font-semibold text-brand hover:underline">
            New search
          </Link>
        </div>
        {saved.error && !saved.data ? (
          <ErrorState message={saved.error.message} onRetry={() => void saved.reload()} />
        ) : !saved.data ? (
          <LoadingBlock label="Loading saved searches…" variant="list" />
        ) : saved.data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-4 text-sm text-muted">
            Search the market, then tap <span className="font-semibold text-ink">Alert me</span> to save it — for example “cheap fridge near me” or “foni pasi pe$100”.
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
                <div className="min-w-0 flex-1">
                  <Link href={`/market?q=${encodeURIComponent(s.query)}`} className="block truncate font-semibold hover:text-brand">
                    “{s.query}”
                  </Link>
                  <p className="truncate text-xs text-muted">{s.summary}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {s.hasLocation ? `Within ${s.radiusKm} km of your location` : 'Anywhere in Zimbabwe'}
                    {s.lastNotifiedAt ? ` · last match ${timeAgo(s.lastNotifiedAt)}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-alert" loading={busy === s.id} onClick={() => void removeSearch(s)} aria-label={`Delete saved search ${s.query}`} icon={<Trash2 className="h-4 w-4" />} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="following">
        <h2 id="following" className="mb-2 flex items-center gap-2 text-base font-bold">
          <Store className="h-5 w-5 text-brand" aria-hidden /> Sellers you follow
        </h2>
        {following.error && !following.data ? (
          <ErrorState message={following.error.message} onRetry={() => void following.reload()} />
        ) : !following.data ? (
          <LoadingBlock label="Loading…" variant="list" />
        ) : following.data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-4 text-sm text-muted">Tap “Follow” on a seller’s shop to hear about everything new they post.</p>
        ) : (
          <ul className="space-y-2">
            {following.data.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
                <Avatar src={f.avatarUrl} name={f.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={sellerHref(f.id)} className="block truncate font-semibold hover:text-brand">
                    {f.displayName}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {f.area}, {f.city} · {f.activeListings} on sale
                  </p>
                </div>
                <Button variant="ghost" size="sm" loading={busy === f.id} onClick={() => void unfollow(f)} aria-label={`Unfollow ${f.displayName}`} icon={<UserMinus className="h-4 w-4" />}>
                  <span className="hidden sm:inline">Unfollow</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
