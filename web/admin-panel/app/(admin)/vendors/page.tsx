'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ApprovalBadge,
  Avatar,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  Table,
  Tabs,
  Td,
  Th,
  formatDate,
  useApi,
  type ApprovalStatus,
  type Paged,
} from '@doorstep/web-shared';
import { vendorHref } from '@/lib/routes';

interface AdminVendor {
  id: string;
  name: string;
  phone: string;
  logoUrl: string | null;
  status: ApprovalStatus;
  city: string;
  commissionRateBps: number | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  category: { name: string };
  zone: { id: string; name: string } | null;
  user: { name: string | null; phone: string };
  _count: { orders: number; products: number };
}

export default function VendorsPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="table" />}>
      <Vendors />
    </Suspense>
  );
}

function Vendors() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'' | ApprovalStatus>((params.get('status') as ApprovalStatus) ?? '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<AdminVendor>>('/admin/vendors', { status: status || undefined, q: q || undefined, page, pageSize: 25 });

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Approve new stores, suspend bad actors and set commission overrides." />
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
      <Input className="mb-4 max-w-xs" placeholder="Search name or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {loading && !data ? (
        <LoadingBlock variant="table" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No vendors found" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>Category</Th>
                <Th>Owner</Th>
                <Th>Zone</Th>
                <Th>Commission</Th>
                <Th className="text-right">Orders</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((v) => (
                <tr key={v.id} className="hover:bg-canvas/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={v.logoUrl} name={v.name} size="sm" square />
                      <div className="min-w-0">
                        <Link href={vendorHref(v.id)} className="font-bold hover:text-brand">
                          {v.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {v.city} · {v._count.products} products · {v.ratingCount ? `${v.ratingAvg.toFixed(1)}★` : 'unrated'}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td>{v.category.name}</Td>
                  <Td>
                    {v.user.name}
                    <span className="block text-xs text-muted">{v.user.phone}</span>
                  </Td>
                  <Td>{v.zone?.name ?? '—'}</Td>
                  <Td>{v.commissionRateBps !== null ? `${(v.commissionRateBps / 100).toFixed(1)}%` : 'Default'}</Td>
                  <Td className="text-right">{v._count.orders}</Td>
                  <Td>
                    <ApprovalBadge status={v.status} />
                  </Td>
                  <Td>{formatDate(v.createdAt)}</Td>
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
