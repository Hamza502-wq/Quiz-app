'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  OrderStatusBadge,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  Pagination,
  PaymentStatusBadge,
  Select,
  Table,
  Td,
  Th,
  formatDateTime,
  formatMoney,
  useApi,
  type Order,
  type Paged,
} from '@doorstep/web-shared';

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['active', 'Active'],
  ['PENDING_PAYMENT', 'Awaiting payment'],
  ['PLACED', 'Placed'],
  ['ACCEPTED', 'Preparing'],
  ['READY_FOR_PICKUP', 'Ready for pickup'],
  ['PICKED_UP,ON_THE_WAY', 'Out for delivery'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED,REJECTED', 'Cancelled / rejected'],
] as const;

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const { data, error, loading, reload } = useApi<Paged<Order>>('/admin/orders', {
    page,
    pageSize: 25,
    status: status || undefined,
    q: q || undefined,
    unassigned: unassigned || undefined,
  });

  return (
    <div>
      <PageHeader title="Orders" subtitle="Search, inspect, reassign and cancel orders." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Code, customer phone/name, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select className="max-w-[220px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={unassigned} onChange={(e) => { setUnassigned(e.target.checked); setPage(1); }} className="accent-[#FF7A00]" />
          No rider yet
        </label>
      </div>
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No orders match" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Placed</Th>
                <Th>Customer</Th>
                <Th>Vendor</Th>
                <Th>Rider</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id} className="hover:bg-canvas/60">
                  <Td>
                    <Link href={`/orders/${o.id}`} className="font-bold text-ink hover:text-brand">
                      {o.code}
                    </Link>
                    {o.type === 'PARCEL' ? <span className="ml-1 text-xs text-muted">parcel</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(o.timestamps.placedAt ?? o.timestamps.createdAt)}</Td>
                  <Td>
                    {o.customer?.name}
                    <span className="block text-xs text-muted">{o.customer?.phone}</span>
                  </Td>
                  <Td>{o.vendor?.name ?? '—'}</Td>
                  <Td>{o.rider?.name ?? <span className="text-muted">—</span>}</Td>
                  <Td>
                    <OrderStatusBadge status={o.status} />
                  </Td>
                  <Td>
                    <span className="block text-xs">{PAYMENT_METHOD_LABEL[o.paymentMethod]}</span>
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </Td>
                  <Td className="text-right font-semibold">{formatMoney(o.amounts.totalCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
