'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Store, UserCheck, UserPlus } from 'lucide-react';
import { Avatar, Button, EmptyState, ErrorState, LoadingBlock, Pagination, api, formatDate, useApi, useAuth, useToast } from '@doorstep/web-shared';
import { MarketShell } from '@/components/market/MarketShell';
import { ListingGrid } from '@/components/market/ListingCard';
import type { Storefront } from '@/lib/market';

export default function SellerPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="cards" />}>
      <MarketShell wide>
        <SellerStore />
      </MarketShell>
    </Suspense>
  );
}

function SellerStore() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1);
  const store = useApi<Storefront>(id && !authLoading ? `/market/sellers/${id}` : null, { page, pageSize: 24 });
  const [busy, setBusy] = useState(false);

  if (!id) return <ErrorState message="This link is missing the seller." />;
  if (store.error && !store.data) return <ErrorState message={store.error.status === 404 ? 'This shop is not available.' : store.error.message} onRetry={() => void store.reload()} />;
  if (!store.data) return <LoadingBlock label="Loading shop…" variant="cards" />;
  const { seller, listings } = store.data;

  const toggleFollow = async () => {
    if (!user) return router.push(`/login?next=${encodeURIComponent(`${pathname}?id=${id}`)}`);
    setBusy(true);
    try {
      const res = await api<{ following: boolean; followers: number }>(`/market/sellers/${seller.id}/follow`, { method: seller.following ? 'DELETE' : 'POST' });
      store.setData((prev) => (prev ? { ...prev, seller: { ...prev.seller, following: res.following, followers: res.followers } } : prev!));
      toast(res.following ? `Following ${seller.displayName}. We’ll tell you when they post something new.` : `Unfollowed ${seller.displayName}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 shadow-card sm:flex-row sm:items-center sm:p-5">
        <Avatar src={seller.avatarUrl} name={seller.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-bold sm:text-2xl">{seller.displayName}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {seller.area}, {seller.city}
          </p>
          {seller.bio ? <p className="mt-2 text-sm text-ink-soft">{seller.bio}</p> : null}
          <p className="mt-2 text-xs text-muted">
            {listings.total} on sale · {seller.sold} sold · {seller.followers} follower{seller.followers === 1 ? '' : 's'} · since {formatDate(seller.memberSince)}
          </p>
        </div>
        {seller.isYou ? (
          <Link href="/market/sell" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-brand hover:text-brand">
            <Store className="h-4 w-4" aria-hidden /> Manage listings
          </Link>
        ) : (
          <Button variant={seller.following ? 'secondary' : 'primary'} loading={busy} icon={seller.following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} onClick={() => void toggleFollow()}>
            {seller.following ? 'Following' : 'Follow for alerts'}
          </Button>
        )}
      </section>

      {listings.items.length === 0 ? (
        <EmptyState icon={<Store className="h-9 w-9" aria-hidden />} title="Nothing on sale right now" message={seller.isYou ? 'Post a listing and it shows here.' : 'Follow this seller to hear when they post something new.'} />
      ) : (
        <>
          <ListingGrid items={listings.items} />
          <Pagination page={listings.page} totalPages={listings.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
