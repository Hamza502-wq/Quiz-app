'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Gavel, MapPin, MessageCircle, Pencil, Repeat, RotateCcw, Store, Trash2, Trophy, UserPlus, UserCheck } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  Textarea,
  api,
  cn,
  formatDate,
  formatDateTime,
  timeAgo,
  useApi,
  useAuth,
  useInterval,
  useSocket,
  useSocketEvent,
  useToast,
} from '@doorstep/web-shared';
import { MarketShell } from '@/components/market/MarketShell';
import { AuctionCountdown } from '@/components/market/ListingCard';
import { ThreadView } from '@/components/market/MarketChat';
import { OfferModal } from '@/components/market/OfferModal';
import { Photo } from '@/components/Photo';
import { useDeliverTo } from '@/lib/location';
import { distanceLabel } from '@/lib/format';
import {
  CONDITION_LABEL,
  centsToDollars,
  dollarsToCents,
  offerHref,
  priceLabel,
  sellerHref,
  threadHref,
  usd,
  whatsappLink,
  type ListingDetail,
  type LiveAuction,
} from '@/lib/market';

export default function ListingPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="detail" />}>
      <MarketShell wide>
        <ListingLoader />
      </MarketShell>
    </Suspense>
  );
}

function ListingLoader() {
  const id = useSearchParams().get('id');
  const { deliverTo, ready } = useDeliverTo();
  const { loading: authLoading } = useAuth();
  // Wait for the sign-in check and saved location so the first response already has the viewer's view.
  const detail = useApi<ListingDetail>(id && ready && !authLoading ? `/market/listings/${id}` : null, { lat: deliverTo?.lat, lng: deliverTo?.lng });

  if (!id) return <ErrorState message="This link is missing the listing." />;
  if (detail.error && !detail.data) return <ErrorState message={detail.error.status === 404 ? 'This listing is no longer available.' : detail.error.message} onRetry={() => void detail.reload()} />;
  if (!detail.data) return <LoadingBlock label="Loading listing…" variant="detail" />;
  return <Listing listing={detail.data} reload={detail.reload} setListing={detail.setData} />;
}

function Listing({ listing: l, reload, setListing }: { listing: ListingDetail; reload: () => Promise<void>; setListing: (d: ListingDetail) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const viewer = l.viewer;
  const isOwner = Boolean(viewer?.isOwner);
  const loginHref = `/login?next=${encodeURIComponent(`${pathname}?id=${l.id}`)}`;
  const photo = l.photos[Math.min(photoIndex, l.photos.length - 1)];

  const ownerAction = async (label: string, run: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await run();
      await reload();
      toast(done);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggleFollow = async () => {
    if (!viewer) return router.push(loginHref);
    setBusy('follow');
    try {
      await api(`/market/sellers/${l.seller.id}/follow`, { method: viewer.following ? 'DELETE' : 'POST' });
      toast(viewer.following ? `Unfollowed ${l.seller.displayName}` : `Following ${l.seller.displayName}. We’ll tell you when they post.`);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const canSwap = l.status === 'ACTIVE' && l.saleType === 'FIXED' && l.openToBarter && !isOwner;

  return (
    // Phones show photos, then price and actions, then the description; wide screens use two columns.
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:grid-rows-[auto_1fr]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-white">
          <div className="aspect-[4/3] w-full bg-canvas">
            {photo ? (
              <Photo key={photo.url} src={photo.url} alt={l.title} className="h-full w-full object-contain" fallback={<div className="h-full w-full bg-canvas" />} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-brand">
                <Store className="h-14 w-14" aria-hidden />
              </div>
            )}
          </div>
          {l.status !== 'ACTIVE' ? (
            <span className="absolute left-3 top-3">
              <Badge tone={l.status === 'SOLD' ? 'red' : 'gray'}>{l.status === 'SOLD' ? 'Sold' : 'Removed'}</Badge>
            </span>
          ) : null}
        </div>
        {l.photos.length > 1 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Photos">
            {l.photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={i === photoIndex}
                aria-label={`Photo ${i + 1}`}
                onClick={() => setPhotoIndex(i)}
                className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2', i === photoIndex ? 'border-brand' : 'border-transparent')}
              >
                <Photo src={p.thumbUrl} alt="" className="h-full w-full object-cover" fallback={<div className="h-full w-full bg-canvas" />} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap gap-1.5">
            {l.saleType === 'AUCTION' ? (
              <Badge tone="dark">
                <Gavel className="h-3 w-3" aria-hidden /> Auction
              </Badge>
            ) : null}
            {l.openToBarter && l.saleType === 'FIXED' ? (
              <Badge tone="green">
                <Repeat className="h-3 w-3" aria-hidden /> Open to swaps
              </Badge>
            ) : null}
            <Badge>{l.kind === 'SERVICE' ? 'Service' : 'Item'}</Badge>
          </div>
          <h1 className="mt-2 break-words text-xl font-bold sm:text-2xl">{l.title}</h1>
          {l.saleType === 'FIXED' ? <p className="mt-1 text-2xl font-bold text-brand">{priceLabel(l)}</p> : null}
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-4 w-4" aria-hidden /> {l.area}, {l.city}
            {l.distanceKm !== null ? ` · ${distanceLabel(l.distanceKm)}` : ''}
          </p>

          {l.saleType === 'AUCTION' ? <AuctionPanel listing={l} onChanged={reload} loginHref={loginHref} /> : null}

          {isOwner ? (
            <div className="mt-4 space-y-2">
              <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink-soft">
                This is your listing
                {viewer?.threads ? ` · ${viewer.threads} conversation${viewer.threads === 1 ? '' : 's'}` : ''}
                {viewer?.pendingOffers ? ` · ${viewer.pendingOffers} swap offer${viewer.pendingOffers === 1 ? '' : 's'} waiting` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {l.status === 'ACTIVE' ? (
                  <Link href={`/market/sell?edit=${encodeURIComponent(l.id)}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-brand hover:text-brand">
                    <Pencil className="h-4 w-4" aria-hidden /> Edit
                  </Link>
                ) : null}
                {l.status === 'ACTIVE' && !(l.saleType === 'AUCTION' && (l.auction?.bidCount ?? 0) > 0) ? (
                  <Button
                    variant="secondary"
                    loading={busy === 'sold'}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => void ownerAction('sold', () => api(`/market/listings/${l.id}/sold`, { method: 'POST' }), 'Marked as sold')}
                  >
                    Mark as sold
                  </Button>
                ) : null}
                {l.status === 'SOLD' && l.saleType === 'FIXED' ? (
                  <Button
                    variant="secondary"
                    loading={busy === 'relist'}
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => void ownerAction('relist', () => api(`/market/listings/${l.id}/relist`, { method: 'POST' }), 'Back on sale')}
                  >
                    Put back on sale
                  </Button>
                ) : null}
                {l.status !== 'REMOVED' ? (
                  <Button variant="ghost" className="text-alert" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              {(viewer?.pendingOffers ?? 0) > 0 ? (
                <Link href="/market/offers" className="block text-sm font-semibold text-brand hover:underline">
                  Answer swap offers
                </Link>
              ) : null}
              {(viewer?.threads ?? 0) > 0 ? (
                <Link href="/market/messages" className="block text-sm font-semibold text-brand hover:underline">
                  Open your messages
                </Link>
              ) : null}
            </div>
          ) : !viewer ? (
            <div className="mt-4 space-y-2">
              <Link href={loginHref} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-dark">
                Sign in to message the seller{l.saleType === 'AUCTION' ? ' or bid' : l.openToBarter ? ' or offer a swap' : ''}
              </Link>
              <p className="text-center text-xs text-muted">Signing in keeps buyers and sellers safe and shows the seller’s WhatsApp.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              {l.status !== 'REMOVED' && (l.status === 'ACTIVE' || viewer.threadId || l.winner?.isYou) ? (
                <Button size="lg" icon={<MessageCircle className="h-5 w-5" />} onClick={() => setChatOpen(true)}>
                  {viewer.threadId ? 'Open chat with seller' : 'Message seller'}
                </Button>
              ) : null}
              {viewer.whatsappPhone ? (
                <a
                  href={whatsappLink(viewer.whatsappPhone, l)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:opacity-90"
                >
                  <WhatsAppIcon /> Chat on WhatsApp
                </a>
              ) : null}
              {canSwap ? (
                viewer.pendingOfferId ? (
                  <Link href={offerHref(viewer.pendingOfferId)} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold hover:border-brand hover:text-brand">
                    <Repeat className="h-5 w-5" aria-hidden /> See your swap offer
                  </Link>
                ) : (
                  <Button size="lg" variant="secondary" icon={<Repeat className="h-5 w-5" />} onClick={() => setOfferOpen(true)}>
                    Offer a swap
                  </Button>
                )
              ) : null}
              {l.status === 'SOLD' && !l.winner?.isYou ? <p className="text-center text-sm text-muted">This listing has been sold.</p> : null}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar src={l.seller.avatarUrl} name={l.seller.displayName} size="md" />
            <div className="min-w-0 flex-1">
              <Link href={sellerHref(l.seller.id)} className="block truncate font-semibold hover:text-brand">
                {l.seller.displayName}
              </Link>
              <p className="truncate text-xs text-muted">
                {l.seller.area}, {l.seller.city} · on DoorStep since {formatDate(l.seller.memberSince)}
              </p>
            </div>
          </div>
          {l.seller.bio ? <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{l.seller.bio}</p> : null}
          <p className="mt-3 text-xs text-muted">
            {l.seller.activeListings} listing{l.seller.activeListings === 1 ? '' : 's'} · {l.seller.followers} follower{l.seller.followers === 1 ? '' : 's'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={sellerHref(l.seller.id)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold hover:border-brand hover:text-brand">
              <Store className="h-4 w-4" aria-hidden /> View shop
            </Link>
            {!isOwner ? (
              <Button
                size="sm"
                variant={viewer?.following ? 'secondary' : 'dark'}
                className="h-9"
                loading={busy === 'follow'}
                icon={viewer?.following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                onClick={() => void toggleFollow()}
              >
                {viewer?.following ? 'Following' : 'Follow'}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="px-1 text-xs text-muted">Stay safe: meet in a public place, check the item before you pay, and never send money to someone you haven’t met.</p>
      </div>

      <div className="min-w-0 self-start lg:col-start-1 lg:row-start-2">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
          <h2 className="text-base font-bold">Description</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-soft">{l.description}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Category</dt>
              <dd className="font-medium">{l.categoryName}</dd>
            </div>
            {l.condition ? (
              <div>
                <dt className="text-xs text-muted">Condition</dt>
                <dd className="font-medium">{CONDITION_LABEL[l.condition]}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted">Location</dt>
              <dd className="font-medium">
                {l.area}, {l.city}
                {l.distanceKm !== null ? <span className="text-muted"> · {distanceLabel(l.distanceKm)} away</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Posted</dt>
              <dd className="font-medium">{timeAgo(l.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {viewer && !isOwner ? (
        <ChatModal
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          listing={l}
          onStarted={(threadId) => setListing({ ...l, viewer: { ...viewer, threadId } })}
        />
      ) : null}
      {canSwap && viewer ? (
        <OfferModal
          open={offerOpen}
          onClose={() => setOfferOpen(false)}
          mode={{ type: 'create', listingId: l.id, listingTitle: l.title }}
          onDone={(offer) => {
            setOfferOpen(false);
            toast('Swap offer sent. We’ll tell you when the seller answers.');
            setListing({ ...l, viewer: { ...viewer, pendingOfferId: offer.id } });
          }}
        />
      ) : null}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this listing?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              onClick={async () => {
                setBusy('delete');
                try {
                  await api(`/market/listings/${l.id}`, { method: 'DELETE' });
                  toast('Listing deleted');
                  router.push('/market/sell');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not delete', 'error');
                  setBusy(null);
                  setConfirmDelete(false);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Buyers will no longer see it, and waiting swap offers are closed.</p>
      </Modal>
    </div>
  );
}

// ───────────────────────────── Live auction ─────────────────────────────

function AuctionPanel({ listing: l, onChanged, loginHref }: { listing: ListingDetail; onChanged: () => Promise<void>; loginHref: string }) {
  const toast = useToast();
  const { socket, connected } = useSocket();
  const [live, setLive] = useState<LiveAuction>({
    listingId: l.id,
    status: l.status,
    auction: l.auction,
    bids: l.bids,
    isHighestBidder: Boolean(l.viewer?.isHighestBidder),
    winner: l.winner,
    serverTime: new Date().toISOString(),
  });
  const [skewMs, setSkewMs] = useState(0);
  const [amount, setAmount] = useState('');
  const [confirmCents, setConfirmCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bidding, setBidding] = useState(false);
  const a = live.auction;
  const open = live.status === 'ACTIVE' && Boolean(a && !a.ended);

  const refresh = useCallback(async () => {
    try {
      const before = Date.now();
      const next = await api<LiveAuction>(`/market/listings/${l.id}/auction`);
      // Half the round trip is a fair guess of when the server answered.
      setSkewMs(new Date(next.serverTime).getTime() - (before + Date.now()) / 2);
      setLive(next);
      return next;
    } catch {
      return null;
    }
  }, [l.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live bids: the listing's Socket.IO room, or a check every 5 seconds without a connection.
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('listing:subscribe', { listingId: l.id });
    return () => {
      socket.emit('listing:unsubscribe', { listingId: l.id });
    };
  }, [socket, connected, l.id]);
  useSocketEvent<{ listingId: string }>('listing:bid', (p) => {
    if (p.listingId === l.id) void refresh();
  });
  useInterval(() => void refresh(), open && !connected ? 5000 : null);

  // When time runs out, ask the server to close the auction and show the result.
  const endsAt = a?.endsAt ?? null;
  useEffect(() => {
    if (!open || !endsAt) return;
    const wait = new Date(endsAt).getTime() - (Date.now() + skewMs) + 1500;
    const t = setTimeout(() => {
      void refresh().then((next) => {
        if (next && next.status !== 'ACTIVE') void onChanged();
      });
    }, Math.max(1000, Math.min(wait, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [open, endsAt, skewMs, refresh, onChanged]);

  // Suggest the minimum next bid, and keep it current as others bid.
  const minNext = a?.minNextBidCents ?? 0;
  useEffect(() => {
    setAmount(centsToDollars(minNext));
  }, [minNext]);

  const review = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cents = dollarsToCents(amount);
    if (cents === null) return setError('Enter your bid in US dollars, e.g. 25 or 25.50.');
    if (cents < minNext) return setError(`Bid at least ${usd(minNext)}.`);
    setConfirmCents(cents);
  };

  const placeBid = async () => {
    if (confirmCents === null) return;
    setBidding(true);
    setError(null);
    try {
      await api(`/market/listings/${l.id}/bids`, { body: { amountCents: confirmCents } });
      toast(`You bid ${usd(confirmCents)}. You’re the highest bidder!`);
      setConfirmCents(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your bid was not placed.');
      setConfirmCents(null);
      await refresh();
    } finally {
      setBidding(false);
    }
  };

  if (!a) return null;
  const isOwner = Boolean(l.viewer?.isOwner);

  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted">{a.currentBidCents === null ? 'Starting bid' : 'Current bid'}</p>
          <p className="text-2xl font-bold text-brand tabular-nums" aria-live="polite">
            {usd(a.currentBidCents ?? a.startingPriceCents)}
          </p>
          <p className="text-xs text-muted">
            {a.bidCount} bid{a.bidCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="text-right">
          <AuctionCountdown auction={a} skewMs={skewMs} className="text-base" />
          <p className="text-xs text-muted">{a.ended ? 'Ended' : 'Ends'} {formatDateTime(a.endsAt)}</p>
        </div>
      </div>

      {live.status === 'SOLD' && live.winner ? (
        <p className={cn('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold', live.winner.isYou ? 'bg-success-light text-success' : 'bg-white text-ink')}>
          <Trophy className="h-4 w-4" aria-hidden />
          {live.winner.isYou ? 'You won! Message the seller to arrange payment and collection.' : `Won by ${live.winner.name}`}
        </p>
      ) : !open ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-muted">
          {isOwner ? 'The auction ended with no bids. Edit the listing to choose a new end time.' : 'This auction has ended.'}
        </p>
      ) : live.isHighestBidder ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-light px-3 py-2 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> You’re the highest bidder
        </p>
      ) : null}

      {open && !isOwner && !live.isHighestBidder ? (
        l.viewer ? (
          <form onSubmit={review} className="mt-3">
            <label className="text-xs font-medium text-ink-soft" htmlFor="bid-amount">
              Your bid (at least {usd(minNext)})
            </label>
            <div className="mt-1 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">US$</span>
                <Input id="bid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-11" maxLength={12} />
              </div>
              <Button type="submit" icon={<Gavel className="h-4 w-4" />}>
                Bid
              </Button>
            </div>
          </form>
        ) : (
          <Link href={loginHref} className="mt-3 flex h-10 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white">
            Sign in to bid
          </Link>
        )
      ) : null}
      <div className="mt-2">
        <InlineError message={error} />
      </div>

      {live.bids.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted">Recent bids</p>
          <ul className="mt-1 divide-y divide-line text-sm">
            {live.bids.map((b, i) => (
              <li key={b.id} className="flex items-center justify-between py-1.5">
                <span className={cn('truncate', i === 0 && 'font-semibold')}>{b.bidder}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{timeAgo(b.createdAt)}</span>
                  <span className={cn('tabular-nums', i === 0 && 'font-semibold')}>{usd(b.amountCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open ? <p className="mt-2 text-[11px] text-muted">A bid in the last 2 minutes adds time, so everyone gets a fair chance to answer.</p> : null}

      <Modal
        open={confirmCents !== null}
        onClose={() => setConfirmCents(null)}
        title="Confirm your bid"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCents(null)}>
              Cancel
            </Button>
            <Button loading={bidding} onClick={() => void placeBid()}>
              Bid {confirmCents !== null ? usd(confirmCents) : ''}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Bids can’t be taken back. If you win, you agree to buy “{l.title}” for your bid.
        </p>
      </Modal>
    </div>
  );
}

// ───────────────────────────── Chat ─────────────────────────────

function ChatModal({ open, onClose, listing, onStarted }: { open: boolean; onClose: () => void; listing: ListingDetail; onStarted: (threadId: string) => void }) {
  const threadId = listing.viewer?.threadId ?? null;
  const suggestions = useMemo(
    () =>
      listing.saleType === 'AUCTION'
        ? ['Hi! Can I see the item before the auction ends?', 'Where can I collect it if I win?']
        : listing.kind === 'SERVICE'
          ? ['Hi! Are you available this week?', 'How much would you charge for my job?']
          : ['Hi! Is this still available?', 'Is the price negotiable?', 'Where can I collect it?'],
    [listing.saleType, listing.kind],
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ threadId: string }>(`/market/listings/${listing.id}/messages`, { body: { body } });
      setDraft('');
      onStarted(res.threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Chat with ${listing.seller.displayName}`} size="md">
      {threadId ? (
        <>
          <ThreadView threadId={threadId} className="h-[55vh]" />
          <Link href={threadHref(threadId)} className="mt-2 block text-center text-xs font-semibold text-brand hover:underline">
            Open in Messages
          </Link>
        </>
      ) : (
        <form onSubmit={(e) => void start(e)} className="space-y-3">
          <p className="text-sm text-muted">About “{listing.title}”. The seller gets your message in the app.</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setDraft(s)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-brand hover:text-brand">
                {s}
              </button>
            ))}
          </div>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} rows={3} placeholder="Write your message" aria-label="Message" />
          <InlineError message={error} />
          <div className="flex justify-end">
            <Button type="submit" loading={sending} disabled={!draft.trim()} icon={<MessageCircle className="h-4 w-4" />}>
              Send
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.38 9.38 0 0 1-1.44-5c0-5.19 4.23-9.42 9.43-9.42a9.37 9.37 0 0 1 6.67 2.77 9.36 9.36 0 0 1 2.76 6.66c0 5.2-4.23 9.42-9.43 9.42m8.02-17.44A11.26 11.26 0 0 0 12.05.75C5.8.75.7 5.84.7 12.1c0 2 .52 3.95 1.52 5.67L.6 23.25l5.6-1.47a11.3 11.3 0 0 0 5.84 1.61h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.02" />
    </svg>
  );
}
