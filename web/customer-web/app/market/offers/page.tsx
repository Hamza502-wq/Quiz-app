'use client';

import { Suspense, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftRight, Check, MessageCircle, Repeat, Undo2, X } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  Tabs,
  api,
  cn,
  timeAgo,
  useApi,
  useInterval,
  useSocket,
  useSocketEvent,
  useToast,
} from '@doorstep/web-shared';
import { RequireCustomer } from '@/components/RequireCustomer';
import { MarketShell } from '@/components/market/MarketShell';
import { ListingThumb } from '@/components/market/ListingCard';
import { OfferModal } from '@/components/market/OfferModal';
import { OFFER_STATUS_LABEL, listingHref, offerHref, priceLabel, threadHref, usd, type ListingSummary, type Offer, type OfferDetail, type OfferStatus } from '@/lib/market';

type Tab = 'waiting' | 'sent' | 'history';

const STATUS_TONE: Record<OfferStatus, 'yellow' | 'green' | 'red' | 'blue' | 'gray'> = {
  PENDING: 'yellow',
  ACCEPTED: 'green',
  DECLINED: 'red',
  COUNTERED: 'blue',
  WITHDRAWN: 'gray',
};

export default function OffersPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="list" />}>
      <MarketShell>
        <RequireCustomer>
          <Offers />
        </RequireCustomer>
      </MarketShell>
    </Suspense>
  );
}

function Offers() {
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get('id');
  const offers = useApi<Offer[]>('/market/offers');
  const { reload } = offers;
  const { connected } = useSocket();
  useInterval(() => void reload(), connected ? null : 20_000);
  useSocketEvent('market:offer', () => void reload());
  const [tab, setTab] = useState<Tab>('waiting');

  const groups = useMemo(() => {
    const all = offers.data ?? [];
    return {
      waiting: all.filter((o) => o.canRespond),
      sent: all.filter((o) => o.canWithdraw),
      history: all.filter((o) => o.status !== 'PENDING'),
    };
  }, [offers.data]);
  const shown = groups[tab];

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Swap offers</h1>
      <p className="mb-4 text-sm text-muted">Trade your things for what you want. Accept, decline or counter offers on your listings.</p>
      <Tabs
        tabs={[
          { value: 'waiting', label: 'For you to answer', count: groups.waiting.length },
          { value: 'sent', label: 'Waiting on others', count: groups.sent.length },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {offers.error && !offers.data ? (
        <ErrorState message={offers.error.message} onRetry={() => void offers.reload()} />
      ) : !offers.data ? (
        <LoadingBlock label="Loading offers…" variant="list" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-9 w-9" aria-hidden />}
          title={tab === 'waiting' ? 'Nothing to answer' : tab === 'sent' ? 'No offers waiting' : 'No past offers'}
          message={tab === 'history' ? 'Answered offers show here.' : 'Look for “Swaps OK” on listings to offer your own items in exchange.'}
          action={
            <Link href="/market?swap=1" className="font-semibold text-brand hover:underline">
              Find listings open to swaps
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => (
            <li key={o.id}>
              <OfferCard offer={o} onOpen={() => router.replace(offerHref(o.id), { scroll: false })} />
            </li>
          ))}
        </ul>
      )}
      {openId ? (
        <OfferDetailModal
          offerId={openId}
          onClose={() => router.replace(pathname, { scroll: false })}
          onChanged={() => void reload()}
        />
      ) : null}
    </div>
  );
}

function ItemsLine({ items, cashCents }: { items: ListingSummary[]; cashCents: number }) {
  return (
    <span>
      {items.map((i) => i.title).join(', ')}
      {cashCents > 0 ? ` + ${usd(cashCents)} cash` : ''}
    </span>
  );
}

function OfferCard({ offer: o, onOpen }: { offer: Offer; onOpen: () => void }) {
  const who = o.mine ? 'You' : o.madeBy === 'buyer' ? o.buyerName : o.sellerName;
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-line bg-white p-3 text-left shadow-card hover:border-brand sm:p-4">
      <div className="flex items-start gap-3">
        <ListingThumb listing={o.listing} className="h-14 w-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{o.listing.title}</p>
            <Badge tone={STATUS_TONE[o.status]}>{OFFER_STATUS_LABEL[o.status]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {who} {o.parentId ? 'countered' : 'offered'} · {timeAgo(o.createdAt)}
          </p>
          <p className="mt-1 flex items-start gap-1 text-sm">
            <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            <ItemsLine items={o.items} cashCents={o.cashCents} />
          </p>
        </div>
      </div>
    </button>
  );
}

function OfferDetailModal({ offerId, onClose, onChanged }: { offerId: string; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const detail = useApi<OfferDetail>(`/market/offers/${offerId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const o = detail.data;

  const act = async (action: 'accept' | 'decline' | 'withdraw') => {
    if (!o) return;
    setBusy(action);
    try {
      const res = await api<Offer & { threadId?: string }>(`/market/offers/${o.id}/${action}`, { method: 'POST' });
      onChanged();
      if (action === 'accept') {
        toast('Swap agreed! Message each other to arrange the exchange.');
        if (res.threadId) router.push(threadHref(res.threadId));
        return;
      }
      toast(action === 'decline' ? 'Offer declined' : 'Offer withdrawn');
      await detail.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
      await detail.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Swap offer"
      size="lg"
      footer={
        o && (o.canRespond || o.canWithdraw) ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            {o.canWithdraw ? (
              <Button variant="secondary" loading={busy === 'withdraw'} icon={<Undo2 className="h-4 w-4" />} onClick={() => void act('withdraw')}>
                Withdraw offer
              </Button>
            ) : null}
            {o.canRespond ? (
              <>
                <Button variant="ghost" className="text-alert" loading={busy === 'decline'} icon={<X className="h-4 w-4" />} onClick={() => void act('decline')}>
                  Decline
                </Button>
                <Button variant="secondary" icon={<Repeat className="h-4 w-4" />} onClick={() => setCountering(true)}>
                  Counter
                </Button>
                <Button loading={busy === 'accept'} icon={<Check className="h-4 w-4" />} onClick={() => void act('accept')}>
                  Accept swap
                </Button>
              </>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {detail.error && !o ? (
        <ErrorState message={detail.error.message} />
      ) : !o ? (
        <LoadingBlock label="Loading offer…" variant="detail" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[o.status]}>{OFFER_STATUS_LABEL[o.status]}</Badge>
            <span className="text-xs text-muted">
              {o.role === 'seller' ? `${o.buyerName} wants your listing` : `You want ${o.sellerName}’s listing`}
            </span>
          </div>

          <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Side title={o.role === 'buyer' ? 'You get' : 'You give'}>
              <ItemRow item={o.listing} />
            </Side>
            <div className="flex items-center justify-center text-brand">
              <ArrowLeftRight className="h-6 w-6 rotate-90 sm:rotate-0" aria-hidden />
            </div>
            <Side title={o.role === 'buyer' ? 'You give' : 'You get'}>
              {o.items.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
              {o.cashCents > 0 ? <p className="rounded-lg bg-success-light px-2 py-1.5 text-sm font-semibold text-success">+ {usd(o.cashCents)} cash</p> : null}
            </Side>
          </div>

          {o.message ? (
            <blockquote className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink-soft">
              “{o.message}” <span className="text-xs text-muted">— {o.mine ? 'you' : o.madeBy === 'buyer' ? o.buyerName : o.sellerName}</span>
            </blockquote>
          ) : null}

          {o.status === 'ACCEPTED' ? (
            <Link href="/market/messages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
              <MessageCircle className="h-4 w-4" aria-hidden /> Message each other to arrange the swap
            </Link>
          ) : null}

          {o.history.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted">Earlier offers</p>
              <ol className="mt-1 space-y-1 text-sm">
                {o.history.map((h) => (
                  <li key={h.id} className={cn('rounded-lg border border-line px-2 py-1.5')}>
                    <span className="font-medium">{h.mine ? 'You' : h.madeBy === 'buyer' ? h.buyerName : h.sellerName}:</span> <ItemsLine items={h.items} cashCents={h.cashCents} />
                    <span className="text-xs text-muted"> · {OFFER_STATUS_LABEL[h.status].toLowerCase()}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
      {o && o.canRespond ? (
        <OfferModal
          open={countering}
          onClose={() => setCountering(false)}
          mode={{ type: 'counter', offer: o }}
          onDone={(counter) => {
            setCountering(false);
            toast('Counter offer sent');
            onChanged();
            router.replace(offerHref(counter.id), { scroll: false });
          }}
        />
      ) : null}
    </Modal>
  );
}

function Side({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ItemRow({ item }: { item: ListingSummary }) {
  return (
    <Link href={listingHref(item.id)} className="flex items-center gap-2 rounded-lg hover:bg-canvas">
      <ListingThumb listing={item} className="h-12 w-12 shrink-0 rounded-lg" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{item.title}</span>
        <span className="block text-xs text-muted">Listed at {priceLabel(item)}</span>
      </span>
    </Link>
  );
}
