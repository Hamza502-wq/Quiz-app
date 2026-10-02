'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ApprovalBadge,
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  PlateBadge,
  Table,
  Tabs,
  Td,
  Th,
  formatDate,
  formatMoney,
  useApi,
  vehicleLabel,
  type ApprovalStatus,
  type Paged,
} from '@doorstep/web-shared';
import { riderHref } from '@/lib/routes';

interface AdminRider {
  id: string;
  status: ApprovalStatus;
  isOnline: boolean;
  vehicleType: string;
  vehiclePlate: string | null;
  ratingAvg: number;
  ratingCount: number;
  cashLimitCents: number | null;
  cashOwedCents: number;
  createdAt: string;
  user: { name: string | null; phone: string; status: string; avatarUrl: string | null };
  wallet: { balanceCents: number } | null;
  zone: { name: string } | null;
}

export default function RidersPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="table" />}>
      <Riders />
    </Suspense>
  );
}

function Riders() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'' | ApprovalStatus>((params.get('status') as ApprovalStatus) ?? '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<AdminRider>>('/admin/riders', { status: status || undefined, q: q || undefined, page, pageSize: 25 });

  return (
    <div>
      <PageHeader title="Riders" subtitle="Review documents, approve riders, manage cash limits and remittances." />
      <Tabs
        tabs={[
          { value: '' as const, label: 'All' },
          { value: 'PENDING' as const, label: 'Pending approval' },
          { value: 'APPROVED' as const, label: 'Approved' },
          { value: 'SUSPENDED' as const, label: 'Suspended' },
          { value: 'REJECTED' as const, label: 'Rejected' },
        ]}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />
      <Input className="mb-4 max-w-xs" placeholder="Name, phone or plate…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {loading && !data ? (
        <LoadingBlock variant="table" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No riders found" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Rider</Th>
                <Th>Vehicle</Th>
                <Th>Zone</Th>
                <Th>Status</Th>
                <Th className="text-right">Wallet</Th>
                <Th className="text-right">Cash owed</Th>
                <Th>Rating</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={r.user.avatarUrl} name={r.user.name ?? r.user.phone} size="sm" />
                      <div className="min-w-0">
                        <Link href={riderHref(r.id)} className="font-bold hover:text-brand">
                          {r.user.name ?? r.user.phone}
                        </Link>
                        <span className="block text-xs text-muted">{r.user.phone}</span>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {r.vehiclePlate ? <PlateBadge plate={r.vehiclePlate} /> : null}
                    <span className="block text-xs text-muted">{vehicleLabel(r.vehicleType)}</span>
                  </Td>
                  <Td>{r.zone?.name ?? '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <ApprovalBadge status={r.status} />
                      {r.isOnline ? <Badge tone="green">Online</Badge> : null}
                    </div>
                  </Td>
                  <Td className="text-right">{formatMoney(r.wallet?.balanceCents ?? 0)}</Td>
                  <Td className={`text-right ${r.cashOwedCents > 0 ? 'font-semibold text-alert' : ''}`}>{formatMoney(r.cashOwedCents)}</Td>
                  <Td>{r.ratingCount ? `${r.ratingAvg.toFixed(1)} ★` : '—'}</Td>
                  <Td>{formatDate(r.createdAt)}</Td>
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
