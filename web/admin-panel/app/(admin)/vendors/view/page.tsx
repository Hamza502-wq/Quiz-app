'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Ban, XCircle, Wallet } from 'lucide-react';
import {
  ApprovalBadge,
  Button,
  Card,
  DAY_NAMES,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PAYMENT_METHOD_LABEL,
  Select,
  StatCard,
  Textarea,
  api,
  formatDate,
  formatMoney,
  useApi,
  useToast,
  type ApprovalStatus,
  type OpeningHour,
  type PayoutMethod,
  type VendorBalance,
} from '@doorstep/web-shared';

interface VendorDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string;
  email: string | null;
  logoUrl: string | null;
  addressLine: string;
  landmark: string | null;
  city: string;
  lat: number;
  lng: number;
  status: ApprovalStatus;
  isAcceptingOrders: boolean;
  commissionRateBps: number | null;
  avgPrepMinutes: number;
  minOrderCents: number;
  ratingAvg: number;
  ratingCount: number;
  payoutMethod: PayoutMethod | null;
  payoutAccount: string | null;
  payoutAccountName: string | null;
  payoutBankName: string | null;
  createdAt: string;
  zoneId: string | null;
  category: { name: string };
  zone: { id: string; name: string } | null;
  openingHours: OpeningHour[];
  user: { id: string; name: string | null; phone: string; status: string; createdAt: string };
  _count: { orders: number; products: number };
  balance: VendorBalance;
}

interface Zone {
  id: string;
  name: string;
}

export default function VendorDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="detail" />}>
      <VendorDetailView />
    </Suspense>
  );
}

function VendorDetailView() {
  const id = useSearchParams().get('id') ?? '';
  const toast = useToast();
  const { data: v, error, loading, reload } = useApi<VendorDetail>(id ? `/admin/vendors/${encodeURIComponent(id)}` : null);
  const zones = useApi<Zone[]>('/admin/zones');
  const [statusModal, setStatusModal] = useState<ApprovalStatus | null>(null);
  const [reason, setReason] = useState('');
  const [commission, setCommission] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (v) {
      setCommission(v.commissionRateBps !== null ? String(v.commissionRateBps / 100) : '');
      setZoneId(v.zoneId ?? '');
    }
  }, [v]);

  if (loading && !v) return <LoadingBlock variant="detail" />;
  if (error || !v) return <ErrorState message={error?.message ?? 'Vendor not found'} onRetry={() => void reload()} />;

  const changeStatus = async () => {
    if (!statusModal) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/vendors/${v.id}`, { method: 'PATCH', body: { status: statusModal, reason: reason.trim() || undefined } });
      toast(`${v.name} is now ${statusModal.toLowerCase()}`);
      setStatusModal(null);
      setReason('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const saveTerms = async () => {
    const pct = commission.trim() === '' ? null : Number(commission);
    if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) return toast('Commission must be 0–100%', 'error');
    setBusy(true);
    try {
      await api(`/admin/vendors/${v.id}`, {
        method: 'PATCH',
        body: { commissionRateBps: pct === null ? null : Math.round(pct * 100), zoneId: zoneId || null },
      });
      toast('Vendor terms saved');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createPayout = async () => {
    setBusy(true);
    try {
      await api(`/admin/payouts/vendors/${v.id}`, { body: {} });
      toast('Payout created — process it on the Payouts page');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create payout', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/vendors" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Vendors
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {v.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold">{v.name}</h1>
            <p className="text-sm text-muted">
              {v.category.name} · joined {formatDate(v.createdAt)}
            </p>
          </div>
          <ApprovalBadge status={v.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {v.status !== 'APPROVED' ? (
            <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setStatusModal('APPROVED')}>
              Approve
            </Button>
          ) : null}
          {v.status === 'PENDING' ? (
            <Button variant="secondary" icon={<XCircle className="h-4 w-4" />} onClick={() => setStatusModal('REJECTED')}>
              Reject
            </Button>
          ) : null}
          {v.status === 'APPROVED' ? (
            <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setStatusModal('SUSPENDED')}>
              Suspend
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders" value={v._count.orders} />
        <StatCard label="Products" value={v._count.products} />
        <StatCard label="Rating" value={v.ratingCount ? `${v.ratingAvg.toFixed(1)} ★` : '—'} hint={`${v.ratingCount} reviews`} />
        <StatCard label="Balance owed" value={formatMoney(v.balance.balanceCents)} hint={`Paid ${formatMoney(v.balance.paidOutCents)}`} tone="brand" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <h2 className="mb-2 font-bold">Profile</h2>
          <p>
            <strong>Owner:</strong> {v.user.name} · {v.user.phone}
          </p>
          <p>
            <strong>Store phone:</strong> {v.phone} {v.email ? `· ${v.email}` : ''}
          </p>
          <p>
            <strong>Address:</strong> {v.addressLine}, {v.city}
          </p>
          {v.landmark ? (
            <p>
              <strong>Landmark:</strong> {v.landmark}
            </p>
          ) : null}
          <p>
            <strong>Location:</strong>{' '}
            <a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}>
              Open in Google Maps
            </a>
          </p>
          <p>
            <strong>Prep time:</strong> ~{v.avgPrepMinutes} min · <strong>Min order:</strong> {formatMoney(v.minOrderCents)}
          </p>
          {v.description ? <p className="text-muted">{v.description}</p> : null}
          <h3 className="pt-2 font-semibold">Opening hours (Harare)</h3>
          <ul>
            {DAY_NAMES.map((d, i) => {
              const h = v.openingHours.find((x) => x.dayOfWeek === i);
              return (
                <li key={d} className="flex justify-between">
                  <span>{d}</span>
                  <span className="text-muted">{h ? `${h.opensAt} – ${h.closesAt}` : 'Closed'}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-bold">Commercial terms</h2>
            <Field label="Commission override (%)" hint="Leave empty to use the platform default">
              <Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="e.g. 12.5" />
            </Field>
            <Field label="Service zone">
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">None</option>
                {(zones.data ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button loading={busy} onClick={() => void saveTerms()}>
                Save terms
              </Button>
            </div>
          </Card>
          <Card className="space-y-3 text-sm">
            <h2 className="font-bold">Payouts</h2>
            <p>
              {v.payoutMethod ? (
                <>
                  {PAYMENT_METHOD_LABEL[v.payoutMethod]} · {v.payoutAccount} {v.payoutAccountName ? `(${v.payoutAccountName})` : ''}
                  {v.payoutBankName ? ` · ${v.payoutBankName}` : ''}
                </>
              ) : (
                <span className="text-alert">No payout details on file</span>
              )}
            </p>
            <p className="text-muted">
              Lifetime earnings {formatMoney(v.balance.lifetimeEarningsCents)} · in progress {formatMoney(v.balance.pendingPayoutCents)}
            </p>
            <Button variant="dark" icon={<Wallet className="h-4 w-4" />} disabled={v.balance.balanceCents <= 0 || !v.payoutMethod} loading={busy} onClick={() => void createPayout()}>
              Create payout for {formatMoney(v.balance.balanceCents)}
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(statusModal)}
        onClose={() => setStatusModal(null)}
        title={`${statusModal === 'APPROVED' ? 'Approve' : statusModal === 'REJECTED' ? 'Reject' : 'Suspend'} ${v.name}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusModal(null)}>
              Cancel
            </Button>
            <Button variant={statusModal === 'APPROVED' ? 'primary' : 'danger'} loading={busy} onClick={() => void changeStatus()}>
              Confirm
            </Button>
          </>
        }
      >
        {statusModal !== 'APPROVED' ? (
          <Field label="Reason (shared with the shop)">
            <Textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
        ) : (
          <p className="text-sm">The store becomes visible to customers immediately and the owner is notified.</p>
        )}
        <div className="mt-3">
          <InlineError message={err} />
        </div>
      </Modal>
    </div>
  );
}
