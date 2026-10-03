'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Table,
  Td,
  Textarea,
  Th,
  api,
  appLinks,
  formatDateTime,
  formatMoney,
  useApi,
  useToast,
  type Paged,
} from '@doorstep/web-shared';

interface MarketListing {
  id: string;
  title: string;
  kind: 'ITEM' | 'SERVICE';
  categoryName: string;
  priceCents: number;
  saleType: 'FIXED' | 'AUCTION';
  status: 'ACTIVE' | 'SOLD' | 'REMOVED';
  area: string;
  city: string;
  thumbUrl: string | null;
  createdAt: string;
  auction: { currentBidCents: number | null; bidCount: number; ended: boolean } | null;
  seller: { id: string; displayName: string };
}

const STATUS_TONE = { ACTIVE: 'green', SOLD: 'blue', REMOVED: 'gray' } as const;

/** Link to a listing on the customer site (same domain on Netlify). */
const listingUrl = (id: string) => `${appLinks.customer.replace(/\/+$/, '')}/market/listing?id=${encodeURIComponent(id)}`;

export default function MarketModerationPage() {
  const toast = useToast();
  const [status, setStatus] = useState<'ACTIVE' | 'SOLD' | 'REMOVED' | ''>('ACTIVE');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<MarketListing>>('/market/admin/listings', { status: status || undefined, q: q || undefined, page, pageSize: 20 });
  const [removing, setRemoving] = useState<MarketListing | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search as the admin types (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const remove = async () => {
    if (!removing) return;
    if (reason.trim().length < 3) return setFormError('Say why the listing is removed. The seller sees this.');
    setSaving(true);
    setFormError(null);
    try {
      await api(`/market/admin/listings/${removing.id}`, { method: 'DELETE', body: { reason: reason.trim() } });
      toast('Listing removed and the seller told why');
      setRemoving(null);
      setReason('');
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not remove the listing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Marketplace" subtitle="Listings from sellers on DoorStep Market. Remove anything that breaks the rules." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search listing titles" className="pl-9" maxLength={100} aria-label="Search listings" />
        </label>
        <Select
          className="sm:max-w-[200px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="ACTIVE">On sale</option>
          <option value="SOLD">Sold</option>
          <option value="REMOVED">Removed</option>
          <option value="">All</option>
        </Select>
      </div>

      {loading && !data ? (
        <LoadingBlock variant="table" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No listings" message={q ? 'Nothing matches that search.' : 'Nothing here yet.'} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Listing</Th>
                <Th>Seller</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th>Posted</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {l.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.thumbUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-canvas object-cover" />
                      ) : (
                        <span className="h-10 w-10 shrink-0 rounded-lg bg-canvas" />
                      )}
                      <div className="min-w-0">
                        <p className="max-w-[16rem] truncate font-semibold">{l.title}</p>
                        <p className="text-xs text-muted">
                          {l.categoryName} · {l.area}, {l.city}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>{l.seller.displayName}</Td>
                  <Td>
                    {formatMoney(l.saleType === 'AUCTION' ? (l.auction?.currentBidCents ?? l.priceCents) : l.priceCents)}
                    {l.saleType === 'AUCTION' ? <span className="block text-xs text-muted">Auction · {l.auction?.bidCount ?? 0} bids</span> : null}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[l.status]}>{l.status === 'ACTIVE' ? 'On sale' : l.status.charAt(0) + l.status.slice(1).toLowerCase()}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(l.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <a href={listingUrl(l.id)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-ink-soft hover:bg-canvas" aria-label={`Open ${l.title}`}>
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      </a>
                      {l.status !== 'REMOVED' ? (
                        <Button size="sm" variant="ghost" className="text-alert" icon={<Trash2 className="h-4 w-4" />} onClick={() => setRemoving(l)}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove listing"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void remove()}>
              Remove listing
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">“{removing?.title}” will be hidden from buyers, and waiting swap offers are closed.</p>
        <Field label="Reason (sent to the seller)" className="mt-4">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="e.g. Counterfeit goods are not allowed" />
        </Field>
        <div className="mt-3">
          <InlineError message={formError} />
        </div>
      </Modal>
    </div>
  );
}
