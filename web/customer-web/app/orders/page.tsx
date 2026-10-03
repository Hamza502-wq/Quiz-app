'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardList, MessageCircle, Package } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  OrderStatusBadge,
  PageHeader,
  Pagination,
  Tabs,
  formatDateTime,
  useApi,
  useSocketEvent,
  type Paged,
} from '@doorstep/web-shared';
import { formatIn } from '@/lib/format';
import { orderHref } from '@/lib/routes';
import type { CustomerOrder } from '@/lib/types';
import { RequireCustomer } from '@/components/RequireCustomer';
import { StoreLogo } from '@/components/StoreVisuals';

export default function OrdersPage() {
  return (
    <RequireCustomer>
      <Orders />
    </RequireCustomer>
  );
}

function Orders() {
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [page, setPage] = useState(1);
  const orders = useApi<Paged<CustomerOrder>>('/orders', { active: tab === 'active', page, pageSize: 10 });
  const { reload } = orders;

  // Live status changes can move an order between tabs, so refresh the list.
  useSocketEvent<CustomerOrder>('order:updated', () => void reload());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Your orders" />
      <Tabs
        tabs={[
          { value: 'active', label: 'In progress' },
          { value: 'past', label: 'Past orders' },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
      />
      {orders.error && !orders.data ? (
        <ErrorState message={orders.error.message} onRetry={() => void orders.reload()} />
      ) : !orders.data ? (
        <LoadingBlock label="Loading your orders…" variant="list" />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-9 w-9" aria-hidden />}
          title={tab === 'active' ? 'No orders in progress' : 'No past orders yet'}
          message={tab === 'active' ? 'When you place an order, you can track it here.' : 'Your delivered and cancelled orders will show here.'}
          action={
            <Link href="/" className="font-semibold text-brand hover:underline">
              Browse stores
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {orders.data.items.map((o) => (
              <li key={o.id}>
                <Link href={orderHref(o.id)} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-brand">
                  {o.type === 'PARCEL' ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                      <Package className="h-6 w-6" aria-hidden />
                    </div>
                  ) : (
                    <StoreLogo logoUrl={o.vendor?.logoUrl ?? null} name={o.vendor?.name ?? '?'} className="h-12 w-12 border-line shadow-none" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{o.type === 'PARCEL' ? 'Parcel delivery' : o.vendor?.name}</p>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {o.code} · {formatDateTime(o.timestamps.createdAt)} ·{' '}
                      {o.type === 'PARCEL' ? o.parcel?.description : `${o.items.reduce((n, i) => n + i.quantity, 0)} items`}
                    </p>
                    {o.unreadMessages ? (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                        <MessageCircle className="h-3 w-3" aria-hidden /> {o.unreadMessages} new message{o.unreadMessages === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatIn(o.amounts.totalCents, o.amounts.currency, o.amounts.exchangeRate)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
