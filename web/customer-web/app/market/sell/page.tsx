'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, MessageCircle, Pencil, Plus, Repeat, RotateCcw, Settings, Store, Trash2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  Tabs,
  api,
  timeAgo,
  useApi,
  useToast,
} from '@doorstep/web-shared';
import { RequireCustomer } from '@/components/RequireCustomer';
import { MarketShell } from '@/components/market/MarketShell';
import { AuctionCountdown, ListingThumb } from '@/components/market/ListingCard';
import { ListingForm, SellerProfileForm } from '@/components/market/SellForms';
import { listingHref, priceLabel, sellerHref, type ListingDetail, type MyListing, type SellerProfile } from '@/lib/market';

export default function SellPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="page" />}>
      <MarketShell>
        <RequireCustomer>
          <Sell />
        </RequireCustomer>
      </MarketShell>
    </Suspense>
  );
}

function Sell() {
  const seller = useApi<{ seller: SellerProfile | null }>('/market/me/seller');
  if (seller.error && !seller.data) return <ErrorState message={seller.error.message} onRetry={() => void seller.reload()} />;
  if (!seller.data) return <LoadingBlock label="Loading your shop…" variant="page" />;
  if (!seller.data.seller) {
    return (
      <Card className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <Store className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold">Open your shop on DoorStep Market</h1>
            <p className="mt-1 text-sm text-muted">Sell things, offer your services, run auctions and take swaps. It’s free — tell buyers who you are and where.</p>
          </div>
        </div>
        <SellerProfileForm initial={null} onSaved={(s) => seller.setData({ seller: s })} />
      </Card>
    );
  }
  return <Dashboard seller={seller.data.seller} onSellerChange={(s) => seller.setData({ seller: s })} />;
}

function Dashboard({ seller, onSellerChange }: { seller: SellerProfile; onSellerChange: (s: SellerProfile) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<'ACTIVE' | 'SOLD'>('ACTIVE');
  const listings = useApi<{ items: MyListing[] }>('/market/me/listings', { status: tab });
  const [editingProfile, setEditingProfile] = useState(false);
  const [deleting, setDeleting] = useState<MyListing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ?new=1 opens a blank form; ?edit=<id> loads that listing into it.
  const isNew = params.get('new') === '1';
  const editId = params.get('edit');
  const editing = useApi<ListingDetail>(editId ? `/market/listings/${editId}` : null);
  const formOpen = isNew || Boolean(editId);
  const closeForm = () => router.replace(pathname, { scroll: false });

  useEffect(() => {
    if (editing.error) toast(editing.error.message, 'error');
  }, [editing.error, toast]);

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await run();
      await listings.reload();
      toast(done);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <Avatar src={seller.avatarUrl} name={seller.displayName} size="md" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{seller.displayName}</h1>
          <p className="truncate text-xs text-muted">
            {seller.area}, {seller.city} · WhatsApp {seller.showWhatsapp ? 'shown to buyers' : 'hidden'}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href={sellerHref(seller.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold hover:border-brand hover:text-brand">
            <Eye className="h-4 w-4" aria-hidden /> My shop
          </Link>
          <Button variant="secondary" size="sm" className="h-9" icon={<Settings className="h-4 w-4" />} onClick={() => setEditingProfile(true)}>
            Shop details
          </Button>
          <Button size="sm" className="h-9" icon={<Plus className="h-4 w-4" />} onClick={() => router.replace(`${pathname}?new=1`, { scroll: false })}>
            New listing
          </Button>
        </div>
      </div>

      <Tabs
        tabs={[
          { value: 'ACTIVE', label: 'On sale' },
          { value: 'SOLD', label: 'Sold' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {listings.error && !listings.data ? (
        <ErrorState message={listings.error.message} onRetry={() => void listings.reload()} />
      ) : !listings.data ? (
        <LoadingBlock label="Loading your listings…" variant="list" />
      ) : listings.data.items.length === 0 ? (
        <EmptyState
          icon={<Store className="h-9 w-9" aria-hidden />}
          title={tab === 'ACTIVE' ? 'Nothing on sale yet' : 'Nothing sold yet'}
          message={tab === 'ACTIVE' ? 'Post your first listing — it takes a minute. Add clear photos and a fair price.' : 'Listings you mark as sold, swap or auction off show here.'}
          action={
            tab === 'ACTIVE' ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => router.replace(`${pathname}?new=1`, { scroll: false })}>
                New listing
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {listings.data.items.map((l) => {
            const hasBids = l.saleType === 'AUCTION' && (l.auction?.bidCount ?? 0) > 0;
            return (
              <li key={l.id} className="rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4">
                <div className="flex gap-3">
                  <Link href={listingHref(l.id)} className="shrink-0">
                    <ListingThumb listing={l} className="h-20 w-20 rounded-xl" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={listingHref(l.id)} className="line-clamp-2 font-semibold hover:text-brand">
                      {l.title}
                    </Link>
                    <p className="mt-0.5 text-sm font-bold">
                      {priceLabel(l)}
                      {l.saleType === 'AUCTION' && l.auction ? (
                        <span className="ml-1 text-xs font-medium text-muted">
                          · {l.auction.bidCount} bid{l.auction.bidCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {l.saleType === 'AUCTION' && l.auction && l.status === 'ACTIVE' ? <AuctionCountdown auction={l.auction} className="text-xs" /> : null}
                      {l.openToBarter ? <Badge tone="green">Swaps OK</Badge> : null}
                      <span>Posted {timeAgo(l.createdAt)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {l.threads > 0 ? (
                        <Link href="/market/messages" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> {l.threads} chat{l.threads === 1 ? '' : 's'}
                        </Link>
                      ) : null}
                      {l.pendingOffers > 0 ? (
                        <Link href="/market/offers" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                          <Repeat className="h-3.5 w-3.5" aria-hidden /> {l.pendingOffers} swap offer{l.pendingOffers === 1 ? '' : 's'}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  {l.status === 'ACTIVE' ? (
                    <>
                      <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => router.replace(`${pathname}?edit=${encodeURIComponent(l.id)}`, { scroll: false })}>
                        Edit
                      </Button>
                      {!hasBids ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === `sold:${l.id}`}
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => void act(`sold:${l.id}`, () => api(`/market/listings/${l.id}/sold`, { method: 'POST' }), 'Marked as sold')}
                        >
                          Mark as sold
                        </Button>
                      ) : null}
                    </>
                  ) : l.saleType === 'FIXED' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === `relist:${l.id}`}
                      icon={<RotateCcw className="h-4 w-4" />}
                      onClick={() => void act(`relist:${l.id}`, () => api(`/market/listings/${l.id}/relist`, { method: 'POST' }), 'Back on sale')}
                    >
                      Put back on sale
                    </Button>
                  ) : null}
                  {!(hasBids && l.status === 'ACTIVE') ? (
                    <Button size="sm" variant="ghost" className="text-alert" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(l)}>
                      Delete
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={formOpen} onClose={closeForm} title={editId ? 'Edit listing' : 'New listing'} size="lg">
        {editId && (!editing.data || editing.loading || editing.data.id !== editId) ? (
          editing.error ? (
            <ErrorState message={editing.error.message} />
          ) : (
            <LoadingBlock label="Loading listing…" variant="form" />
          )
        ) : (
          <ListingForm
            key={editId ?? 'new'}
            existing={editId ? (editing.data ?? null) : null}
            seller={seller}
            onCancel={closeForm}
            onSaved={(saved) => {
              toast(editId ? 'Listing updated' : 'Listing posted! Followers and people with matching alerts nearby are told.');
              closeForm();
              setTab('ACTIVE');
              void listings.reload();
              if (!editId) router.push(listingHref(saved.id));
            }}
          />
        )}
      </Modal>

      <Modal open={editingProfile} onClose={() => setEditingProfile(false)} title="Shop details" size="lg">
        <SellerProfileForm
          initial={seller}
          onCancel={() => setEditingProfile(false)}
          onSaved={(s) => {
            onSellerChange(s);
            setEditingProfile(false);
            toast('Shop details saved');
          }}
        />
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this listing?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              onClick={async () => {
                if (!deleting) return;
                const target = deleting;
                setDeleting(null);
                await act('delete', () => api(`/market/listings/${target.id}`, { method: 'DELETE' }), 'Listing deleted');
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">“{deleting?.title}” will no longer be shown to buyers, and waiting swap offers are closed.</p>
      </Modal>
    </div>
  );
}
