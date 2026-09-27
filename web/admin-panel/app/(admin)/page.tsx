'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bike, ClipboardList, DollarSign, Scale, Store, TrendingUp, Users, Wallet } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Card,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
  formatMoney,
  toDateInput,
  useApi,
  useInterval,
} from '@doorstep/web-shared';

interface Summary {
  ordersToday: number;
  deliveredToday: number;
  gmvTodayCents: number;
  platformRevenueTodayCents: number;
  activeOrders: number;
  unassignedOrders: number;
  onlineRiders: number;
  pendingVendors: number;
  pendingRiders: number;
  openDisputes: number;
  pendingPayouts: { count: number; amountCents: number };
  pendingRefunds: number;
  activeUsers24h: number;
}

interface Analytics {
  totals: {
    orders: number;
    delivered: number;
    cancelled: number;
    gmvCents: number;
    commissionCents: number;
    deliveryFeeCents: number;
    riderPayCents: number;
    platformRevenueCents: number;
    completionRate: number;
  };
  series: Array<{ day: string; orders: number; delivered: number; cancelled: number; gmvCents: number; commissionCents: number; platformRevenueCents: number }>;
  users: { activeCustomers: number; newCustomers: number; activeUsers: number };
  paymentMix: Array<{ method: string; orders: number; totalCents: number }>;
  topVendors: Array<{ id: string; name: string; orders: number; gmvCents: number; commissionCents: number }>;
  riderPerformance: Array<{
    riderId: string;
    name: string | null;
    phone: string;
    ratingAvg: number;
    deliveries: number;
    avgDeliveryMinutes: number | null;
    acceptanceRate: number | null;
    earningsCents: number;
  }>;
}

const PIE_COLORS = ['#FF7A00', '#1A1A1A', '#E01E1E', '#319B42', '#FFD200'];

export default function DashboardPage() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(toDateInput(today));
  const summary = useApi<Summary>('/admin/dashboard');
  const analytics = useApi<Analytics>('/admin/analytics', {
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999`).toISOString(),
  });
  useInterval(() => void summary.reload(), 30_000);

  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Operations dashboard" subtitle="Live numbers refresh every 30 seconds." />

      {summary.error && !s ? (
        <ErrorState message={summary.error.message} onRetry={() => void summary.reload()} />
      ) : !s ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Orders today" value={s.ordersToday} hint={`${s.deliveredToday} delivered`} icon={<ClipboardList className="h-5 w-5" />} tone="brand" />
            <StatCard label="GMV today" value={formatMoney(s.gmvTodayCents)} hint={`Platform revenue ${formatMoney(s.platformRevenueTodayCents)}`} icon={<DollarSign className="h-5 w-5" />} tone="success" />
            <StatCard label="Active orders" value={s.activeOrders} hint={s.unassignedOrders ? `${s.unassignedOrders} waiting for a rider` : 'All assigned'} icon={<TrendingUp className="h-5 w-5" />} tone={s.unassignedOrders ? 'alert' : 'default'} />
            <StatCard label="Riders online" value={s.onlineRiders} hint={`${s.activeUsers24h} users active in 24h`} icon={<Bike className="h-5 w-5" />} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ActionTile href="/vendors?status=PENDING" icon={<Store className="h-4 w-4" />} label="Vendors to approve" count={s.pendingVendors} />
            <ActionTile href="/riders?status=PENDING" icon={<Bike className="h-4 w-4" />} label="Riders to approve" count={s.pendingRiders} />
            <ActionTile href="/disputes" icon={<Scale className="h-4 w-4" />} label="Open disputes" count={s.openDisputes} />
            <ActionTile href="/disputes?tab=refunds" icon={<AlertTriangle className="h-4 w-4" />} label="Refunds to process" count={s.pendingRefunds} />
            <ActionTile href="/payouts?status=PENDING" icon={<Wallet className="h-4 w-4" />} label={`Payouts pending (${formatMoney(s.pendingPayouts.amountCents)})`} count={s.pendingPayouts.count} />
          </div>
        </>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold">Analytics</h2>
          <div className="flex gap-2">
            <Field label="From">
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        </div>
        {analytics.error ? (
          <ErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} />
        ) : !analytics.data ? (
          <LoadingBlock />
        ) : (
          <AnalyticsBody data={analytics.data} />
        )}
      </Card>
    </div>
  );
}

function ActionTile({ href, icon, label, count }: { href: string; icon: React.ReactNode; label: string; count: number }) {
  return (
    <Link href={href} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${count ? 'border-brand/40 bg-brand-light text-ink hover:border-brand' : 'border-line bg-white text-muted'}`}>
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${count ? 'bg-brand text-white' : 'bg-canvas'}`}>{count}</span>
    </Link>
  );
}

function AnalyticsBody({ data }: { data: Analytics }) {
  const t = data.totals;
  const series = data.series.map((d) => ({ ...d, gmv: d.gmvCents / 100, revenue: d.platformRevenueCents / 100 }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders" value={t.orders} hint={`${t.completionRate}% completed · ${t.cancelled} cancelled/rejected`} />
        <StatCard label="GMV (delivered)" value={formatMoney(t.gmvCents)} />
        <StatCard label="Platform revenue" value={formatMoney(t.platformRevenueCents)} hint={`Commission ${formatMoney(t.commissionCents)} + fees ${formatMoney(t.deliveryFeeCents)} − rider pay ${formatMoney(t.riderPayCents)}`} tone="success" />
        <StatCard label="Active customers" value={data.users.activeCustomers} hint={`${data.users.newCustomers} new · ${data.users.activeUsers} users seen`} icon={<Users className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold">Orders per day</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececec" />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#FF7A00" radius={[0, 0, 0, 0]} />
                <Bar dataKey="cancelled" name="Cancelled/rejected" stackId="a" fill="#E01E1E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Revenue per day (US$)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececec" />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => `US$${Number(v).toFixed(2)}`} />
                <Legend />
                <Area type="monotone" dataKey="gmv" name="GMV" stroke="#FF7A00" fill="#FF7A00" fillOpacity={0.15} />
                <Area type="monotone" dataKey="revenue" name="Platform revenue" stroke="#1A1A1A" fill="#1A1A1A" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div>
          <h3 className="mb-2 font-semibold">Payment mix</h3>
          {data.paymentMix.length === 0 ? (
            <p className="text-sm text-muted">No delivered orders.</p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.paymentMix.map((p) => ({ name: PAYMENT_METHOD_LABEL[p.method] ?? p.method, value: p.orders }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {data.paymentMix.map((p, i) => (
                      <Cell key={p.method} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="xl:col-span-2">
          <h3 className="mb-2 font-semibold">Top vendors</h3>
          <Table>
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Sales</Th>
                <Th className="text-right">Commission</Th>
              </tr>
            </thead>
            <tbody>
              {data.topVendors.map((v) => (
                <tr key={v.id}>
                  <Td>
                    <Link href={`/vendors/${v.id}`} className="font-semibold hover:text-brand">
                      {v.name}
                    </Link>
                  </Td>
                  <Td className="text-right">{v.orders}</Td>
                  <Td className="text-right">{formatMoney(v.gmvCents)}</Td>
                  <Td className="text-right">{formatMoney(v.commissionCents)}</Td>
                </tr>
              ))}
              {data.topVendors.length === 0 ? (
                <tr>
                  <Td className="text-center text-muted">No sales in this period</Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Rider performance</h3>
        <Table>
          <thead>
            <tr>
              <Th>Rider</Th>
              <Th className="text-right">Deliveries</Th>
              <Th className="text-right">Avg time</Th>
              <Th className="text-right">Acceptance</Th>
              <Th className="text-right">Rating</Th>
              <Th className="text-right">Earnings</Th>
            </tr>
          </thead>
          <tbody>
            {data.riderPerformance.map((r) => (
              <tr key={r.riderId}>
                <Td>
                  <Link href={`/riders/${r.riderId}`} className="font-semibold hover:text-brand">
                    {r.name ?? r.phone}
                  </Link>
                </Td>
                <Td className="text-right">{r.deliveries}</Td>
                <Td className="text-right">{r.avgDeliveryMinutes !== null ? `${r.avgDeliveryMinutes} min` : '—'}</Td>
                <Td className="text-right">{r.acceptanceRate !== null ? `${r.acceptanceRate}%` : '—'}</Td>
                <Td className="text-right">{r.ratingAvg ? `${r.ratingAvg.toFixed(1)} ★` : '—'}</Td>
                <Td className="text-right">{formatMoney(r.earningsCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
