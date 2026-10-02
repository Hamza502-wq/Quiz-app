'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  PayoutStatusBadge,
  StatCard,
  Table,
  Td,
  Th,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatMoney,
  toDateInput,
  useApi,
  type Payout,
  type VendorBalance,
} from '@doorstep/web-shared';

interface SalesReport {
  totals: { orders: number; grossCents: number; commissionCents: number; netCents: number; averageOrderCents: number };
  daily: Array<{ day: string; orders: number; grossCents: number; commissionCents: number; netCents: number }>;
  statusCounts: Record<string, number>;
  topProducts: Array<{ name: string; quantity: number; revenueCents: number }>;
}

interface Statement {
  vendorName: string;
  summary: { orders: number; grossCents: number; commissionCents: number; netCents: number };
  orders: Array<{
    id: string;
    code: string;
    deliveredAt: string;
    paymentMethod: string;
    subtotalCents: number;
    commissionRateBps: number;
    commissionCents: number;
    vendorEarningCents: number;
  }>;
  payouts: Payout[];
  balance: VendorBalance;
}

function rangeToQuery(from: string, to: string) {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T23:59:59.999`);
  return { from: f.toISOString(), to: t.toISOString() };
}

export default function ReportsPage() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(toDateInput(today));
  const query = rangeToQuery(from, to);
  const sales = useApi<SalesReport>('/vendor/reports/sales', query);
  const statement = useApi<Statement>('/vendor/reports/statement', query);

  const exportStatement = () => {
    if (!statement.data) return;
    downloadCsv(`doorstep-statement-${from}-to-${to}.csv`, [
      ['Order', 'Delivered', 'Payment', 'Subtotal (USD)', 'Commission rate %', 'Commission (USD)', 'Net earnings (USD)'],
      ...statement.data.orders.map((o) => [
        o.code,
        formatDateTime(o.deliveredAt),
        PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod,
        (o.subtotalCents / 100).toFixed(2),
        (o.commissionRateBps / 100).toFixed(2),
        (o.commissionCents / 100).toFixed(2),
        (o.vendorEarningCents / 100).toFixed(2),
      ]),
      [],
      ['Totals', '', '', (statement.data.summary.grossCents / 100).toFixed(2), '', (statement.data.summary.commissionCents / 100).toFixed(2), (statement.data.summary.netCents / 100).toFixed(2)],
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales reports"
        subtitle="Delivered orders, commission and net earnings."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From">
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        }
      />

      {sales.loading && !sales.data ? (
        <LoadingBlock variant="stats" />
      ) : sales.error ? (
        <ErrorState message={sales.error.message} onRetry={() => void sales.reload()} />
      ) : sales.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Delivered orders" value={sales.data.totals.orders} tone="brand" />
            <StatCard label="Gross sales" value={formatMoney(sales.data.totals.grossCents)} hint={`Avg order ${formatMoney(sales.data.totals.averageOrderCents)}`} />
            <StatCard label="DoorStep commission" value={formatMoney(sales.data.totals.commissionCents)} tone="alert" />
            <StatCard label="Your net earnings" value={formatMoney(sales.data.totals.netCents)} tone="success" />
          </div>

          <Card>
            <h2 className="mb-4 text-lg font-bold">Daily sales</h2>
            {sales.data.daily.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No delivered orders in this period.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sales.data.daily.map((d) => ({ ...d, gross: d.grossCents / 100, net: d.netCents / 100 }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececec" />
                    <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip formatter={(v) => `US$${Number(v).toFixed(2)}`} />
                    <Bar dataKey="gross" name="Gross" fill="#FF7A00" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="net" name="Net" fill="#1A1A1A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <h2 className="mb-3 text-lg font-bold">Top products</h2>
              {sales.data.topProducts.length === 0 ? (
                <p className="text-sm text-muted">No sales yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {sales.data.topProducts.map((p) => (
                    <li key={p.name} className="flex justify-between py-2">
                      <span>
                        <strong>{p.quantity}×</strong> {p.name}
                      </span>
                      <span className="font-semibold">{formatMoney(p.revenueCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 text-lg font-bold">Order outcomes</h2>
              <ul className="divide-y divide-line text-sm">
                {Object.entries(sales.data.statusCounts).map(([status, count]) => (
                  <li key={status} className="flex justify-between py-2">
                    <span className="capitalize">{status.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
                {Object.keys(sales.data.statusCounts).length === 0 ? <li className="py-2 text-muted">No orders in this period.</li> : null}
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Commission statement</h2>
            <p className="text-sm text-muted">
              {formatDate(query.from)} – {formatDate(query.to)}
            </p>
          </div>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportStatement} disabled={!statement.data?.orders.length}>
            Export CSV
          </Button>
        </div>
        {statement.loading && !statement.data ? (
          <LoadingBlock variant="table" />
        ) : statement.error ? (
          <ErrorState message={statement.error.message} onRetry={() => void statement.reload()} />
        ) : statement.data && statement.data.orders.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Delivered</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Subtotal</Th>
                  <Th className="text-right">Commission</Th>
                  <Th className="text-right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {statement.data.orders.map((o) => (
                  <tr key={o.id}>
                    <Td className="font-semibold">{o.code}</Td>
                    <Td>{formatDateTime(o.deliveredAt)}</Td>
                    <Td>{PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</Td>
                    <Td className="text-right">{formatMoney(o.subtotalCents)}</Td>
                    <Td className="text-right">
                      {formatMoney(o.commissionCents)} <span className="text-xs text-muted">({(o.commissionRateBps / 100).toFixed(1)}%)</span>
                    </Td>
                    <Td className="text-right font-semibold">{formatMoney(o.vendorEarningCents)}</Td>
                  </tr>
                ))}
                <tr className="bg-canvas font-bold">
                  <Td>Total</Td>
                  <Td>{statement.data.summary.orders} orders</Td>
                  <Td />
                  <Td className="text-right">{formatMoney(statement.data.summary.grossCents)}</Td>
                  <Td className="text-right">{formatMoney(statement.data.summary.commissionCents)}</Td>
                  <Td className="text-right text-brand">{formatMoney(statement.data.summary.netCents)}</Td>
                </tr>
              </tbody>
            </Table>
            {statement.data.payouts.length > 0 ? (
              <div className="mt-6">
                <h3 className="mb-2 font-bold">Payouts in this period</h3>
                <ul className="divide-y divide-line text-sm">
                  {statement.data.payouts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2">
                      <span>{formatDate(p.requestedAt)}</span>
                      <PayoutStatusBadge status={p.status} />
                      <span className="font-semibold">{formatMoney(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No delivered orders" message="Your statement fills up as orders are delivered." />
        )}
      </Card>
    </div>
  );
}
