'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  Pagination,
  PayoutStatusBadge,
  StatCard,
  Table,
  Td,
  Th,
  formatDate,
  formatMoney,
  useApi,
  type Paged,
  type Payout,
  type VendorBalance,
} from '@doorstep/web-shared';
import { useVendor } from '@/components/VendorContext';

export default function PayoutsPage() {
  const { vendor } = useVendor();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Payout> & { balance: VendorBalance }>('/vendor/payouts', { page, pageSize: 20 });

  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" subtitle="DoorStep pays your net earnings (sales minus commission) to your payout account." />
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Current balance" value={formatMoney(data.balance.balanceCents)} tone="brand" icon={<Wallet className="h-5 w-5" />} />
            <StatCard label="In progress" value={formatMoney(data.balance.pendingPayoutCents)} />
            <StatCard label="Paid out (lifetime)" value={formatMoney(data.balance.paidOutCents)} tone="success" />
          </div>
          <Card className="text-sm">
            <p>
              Payout account:{' '}
              {vendor.payoutMethod ? (
                <strong>
                  {PAYMENT_METHOD_LABEL[vendor.payoutMethod]} · {vendor.payoutAccount} {vendor.payoutAccountName ? `(${vendor.payoutAccountName})` : ''}
                </strong>
              ) : (
                <span className="text-alert">not set</span>
              )}{' '}
              ·{' '}
              <Link href="/store" className="font-semibold text-brand hover:underline">
                Change
              </Link>
            </p>
          </Card>
          {data.items.length === 0 ? (
            <EmptyState title="No payouts yet" message="Payouts appear here once DoorStep processes your earnings." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Requested</Th>
                    <Th>Period</Th>
                    <Th>Method</Th>
                    <Th>Status</Th>
                    <Th>Reference</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <Td>{formatDate(p.requestedAt)}</Td>
                      <Td>{p.periodStart && p.periodEnd ? `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}` : '—'}</Td>
                      <Td>
                        {PAYMENT_METHOD_LABEL[p.method]} · {p.accountNumber}
                      </Td>
                      <Td>
                        <PayoutStatusBadge status={p.status} />
                      </Td>
                      <Td>{p.reference ?? '—'}</Td>
                      <Td className="text-right font-semibold">{formatMoney(p.amountCents)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
