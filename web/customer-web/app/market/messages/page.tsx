'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Avatar, Badge, EmptyState, ErrorState, LoadingBlock, cn, timeAgo, useApi, useInterval, useSocket, useSocketEvent } from '@doorstep/web-shared';
import { RequireCustomer } from '@/components/RequireCustomer';
import { MarketShell } from '@/components/market/MarketShell';
import { ListingThumb } from '@/components/market/ListingCard';
import { ThreadView } from '@/components/market/MarketChat';
import { listingHref, threadHref, usd, type MarketThread, type MarketThreadSummary } from '@/lib/market';

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="list" />}>
      <MarketShell>
        <RequireCustomer>
          <Messages />
        </RequireCustomer>
      </MarketShell>
    </Suspense>
  );
}

function Messages() {
  const router = useRouter();
  const threadId = useSearchParams().get('thread');
  const threads = useApi<MarketThreadSummary[]>('/market/threads');
  const { reload } = threads;
  const { connected } = useSocket();
  useInterval(() => void reload(), connected ? null : 15_000);
  useSocketEvent('market:message', () => void reload());
  const [open, setOpen] = useState<MarketThread | null>(null);
  const onLoaded = useCallback(
    (t: MarketThread) => {
      setOpen(t);
      // Opening marks it read, so refresh the unread counts in the list.
      void reload();
    },
    [reload],
  );

  const list = (
    <div className={cn(threadId ? 'hidden md:block' : 'block')}>
      {threads.error && !threads.data ? (
        <ErrorState message={threads.error.message} onRetry={() => void threads.reload()} />
      ) : !threads.data ? (
        <LoadingBlock label="Loading conversations…" variant="list" />
      ) : threads.data.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-9 w-9" aria-hidden />}
          title="No messages yet"
          message="When you message a seller, or a buyer messages you, the conversation shows here."
          action={
            <Link href="/market" className="font-semibold text-brand hover:underline">
              Browse the market
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {threads.data.map((t) => (
            <li key={t.id}>
              <Link
                href={threadHref(t.id)}
                scroll={false}
                className={cn('flex items-center gap-3 p-3 hover:bg-canvas', t.id === threadId && 'bg-brand-light/60')}
              >
                <div className="relative shrink-0">
                  <ListingThumb listing={{ thumbUrl: t.listing.thumbUrl, title: t.listing.title, kind: 'ITEM' }} className="h-12 w-12 rounded-xl" />
                  <span className="absolute -bottom-1 -right-1">
                    <Avatar src={t.other.avatarUrl} name={t.other.name} size="xs" className="ring-2 ring-white" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('truncate text-sm', t.unread ? 'font-bold' : 'font-semibold')}>{t.other.name}</p>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(t.lastMessage?.createdAt ?? t.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {t.role === 'seller' ? 'Buying your' : 'Selling'} “{t.listing.title}”
                  </p>
                  <p className={cn('truncate text-xs', t.unread ? 'font-semibold text-ink' : 'text-ink-soft')}>
                    {t.lastMessage ? `${t.lastMessage.mine ? 'You: ' : ''}${t.lastMessage.body}` : 'Start the conversation'}
                  </p>
                </div>
                {t.unread > 0 ? (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">{t.unread}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className={cn('grid gap-4', threadId && 'md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
      {list}
      {threadId ? (
        <section className="min-w-0 rounded-2xl border border-line bg-white p-3 shadow-card sm:p-4" aria-label="Conversation">
          <div className="mb-3 flex items-center gap-3">
            <button type="button" onClick={() => router.replace('/market/messages', { scroll: false })} className="rounded-lg p-1 text-muted hover:bg-canvas md:hidden" aria-label="Back to conversations">
              <ArrowLeft className="h-5 w-5" />
            </button>
            {open && open.id === threadId ? (
              <>
                <Avatar src={open.other.avatarUrl} name={open.other.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{open.other.name}</p>
                  <Link href={listingHref(open.listing.id)} className="block truncate text-xs text-brand hover:underline">
                    {open.listing.title} · {usd(open.listing.priceCents)}
                  </Link>
                </div>
                {open.listing.status !== 'ACTIVE' ? <Badge tone={open.listing.status === 'SOLD' ? 'red' : 'gray'}>{open.listing.status === 'SOLD' ? 'Sold' : 'Removed'}</Badge> : null}
              </>
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
          </div>
          <ThreadView key={threadId} threadId={threadId} onLoaded={onLoaded} className="h-[60vh]" />
        </section>
      ) : null}
    </div>
  );
}
