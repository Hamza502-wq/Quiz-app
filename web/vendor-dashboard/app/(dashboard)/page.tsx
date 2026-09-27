'use client';

import Link from 'next/link';
import { ClipboardList, DollarSign, Star, Wallet } from 'lucide-react';
import {
  Button,
  Card,
  ErrorState,
  LoadingBlock,
  OrderStatusBadge,
  PageHeader,
  StatCard,
  formatMoney,
  formatTime,
  useApi,
  type Order,
  type Paged,
  type VendorBalance,
} from '@doorstep/web-shared';
import { useVendor } from '@/components/VendorContext';

interface SalesReport {
  totals: { orders: number; grossCents: number; commissionCents: number; netCents: number; averageOrderCents: number };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function OverviewPage() {
  const { vendor } = useVendor();
  const today = useApi<SalesReport>('/vendor/reports/sales', { from: startOfTodayIso() });
  const active = useApi<Paged<Order>>('/vendor/orders', { status: 'active', pageSize: 10 });
  const payouts = useApi<Paged<unknown> & { balance: VendorBalance }>('/vendor/payouts', { pageSize: 1 });

  const newOrders = active.data?.items.filter((o) => o.status === 'PLACED').length ?? 0;

  return (
    <div>
      <PageHeader
        title={`Hello, ${vendor.name}`}
        subtitle="Here's how your store is doing today."
        actions={
          <Link href="/orders">
            <Button icon={<ClipboardList className="h-4 w-4" />}>Open orders board</Button>
          </Link>
        }
      />

      {today.error ? (
        <ErrorState message={today.error.message} onRetry={() => void today.reload()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Orders delivered today"
            value={today.data ? today.data.totals.orders : '…'}
            icon={<ClipboardList className="h-5 w-5" />}
            tone="brand"
          />
          <StatCard
            label="Sales today"
            value={today.data ? formatMoney(today.data.totals.grossCents) : '…'}
            hint={today.data ? `Net after commission ${formatMoney(today.data.totals.netCents)}` : undefined}
            icon={<DollarSign className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Balance owed to you"
            value={payouts.data ? formatMoney(payouts.data.balance.balanceCents) : '…'}
            hint="Paid out by DoorStep"
            icon={<Wallet className="h-5 w-5" />}
          />
          <StatCard
            label="Rating"
            value={vendor.ratingCount ? `${vendor.ratingAvg.toFixed(1)} ★` : 'No ratings yet'}
            hint={`${vendor.ratingCount} review${vendor.ratingCount === 1 ? '' : 's'}`}
            icon={<Star className="h-5 w-5" />}
          />
        </div>
      )}

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Active orders</h2>
          {newOrders > 0 ? <span className="text-sm font-semibold text-brand">{newOrders} waiting for you to accept</span> : null}
        </div>
        {active.loading && !active.data ? (
          <LoadingBlock />
        ) : active.error ? (
          <ErrorState message={active.error.message} onRetry={() => void active.reload()} />
        ) : active.data && active.data.items.length > 0 ? (
          <ul className="divide-y divide-line">
            {active.data.items.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">
                    {o.code} · {o.customer?.name}
                  </p>
                  <p className="text-sm text-muted">
                    {o.items.reduce((s, i) => s + i.quantity, 0)} items · {formatMoney(o.amounts.subtotalCents)} · placed{' '}
                    {formatTime(o.timestamps.placedAt ?? o.timestamps.createdAt)}
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No active orders right now.</p>
        )}
      </Card>
    </div>
  );
}
