'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Ban, Banknote, CheckCircle2, Gift, XCircle } from 'lucide-react';
import {
  ApprovalBadge,
  AuthImage,
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PAYMENT_METHOD_LABEL,
  PlateBadge,
  Select,
  StatCard,
  Textarea,
  api,
  centsToInput,
  formatDate,
  formatDateTime,
  formatMoney,
  parseMoneyToCents,
  useApi,
  useToast,
  vehicleLabel,
  type ApprovalStatus,
  type PayoutMethod,
} from '@doorstep/web-shared';

interface RiderDetail {
  id: string;
  status: ApprovalStatus;
  isOnline: boolean;
  nationalId: string;
  idDocumentUrl: string;
  licenceNumber: string;
  licenceDocumentUrl: string;
  licenceExpiry: string | null;
  vehicleType: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  vehicleColor: string | null;
  vehiclePhotoUrl: string | null;
  cashLimitCents: number | null;
  ratingAvg: number;
  ratingCount: number;
  rejectionReason: string | null;
  payoutMethod: PayoutMethod | null;
  payoutAccount: string | null;
  createdAt: string;
  user: { id: string; name: string | null; phone: string; status: string; avatarUrl: string | null; createdAt: string };
  zone: { name: string } | null;
  wallet: {
    balanceCents: number;
    availableForPayoutCents: number;
    cashOwedCents: number;
    cashLimitCents: number;
    cashLimitRemainingCents: number;
    outstandingCashCents: number;
  };
  cashCollections: Array<{ id: string; amountCents: number; settledCents: number; status: string; createdAt: string; order: { code: string } }>;
  transactions: Array<{ id: string; type: string; amountCents: number; balanceAfterCents: number; description: string; createdAt: string }>;
  deliveries: number;
}

export default function RiderDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="detail" />}>
      <RiderDetailView />
    </Suspense>
  );
}

function RiderDetailView() {
  const id = useSearchParams().get('id') ?? '';
  const toast = useToast();
  const { data: r, error, loading, reload } = useApi<RiderDetail>(id ? `/admin/riders/${encodeURIComponent(id)}` : null);
  const [statusModal, setStatusModal] = useState<ApprovalStatus | null>(null);
  const [reason, setReason] = useState('');
  const [cashLimit, setCashLimit] = useState('');
  const [remitOpen, setRemitOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (r) setCashLimit(r.cashLimitCents !== null ? centsToInput(r.cashLimitCents) : '');
  }, [r]);

  if (loading && !r) return <LoadingBlock variant="detail" />;
  if (error || !r) return <ErrorState message={error?.message ?? 'Rider not found'} onRetry={() => void reload()} />;

  const changeStatus = async () => {
    if (!statusModal) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/riders/${r.id}`, { method: 'PATCH', body: { status: statusModal, reason: reason.trim() || undefined } });
      toast(`Rider ${statusModal.toLowerCase()}`);
      setStatusModal(null);
      setReason('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const saveCashLimit = async () => {
    const cents = cashLimit.trim() === '' ? null : parseMoneyToCents(cashLimit);
    if (cashLimit.trim() !== '' && cents === null) return toast('Enter a valid amount', 'error');
    setBusy(true);
    try {
      await api(`/admin/riders/${r.id}`, { method: 'PATCH', body: { cashLimitCents: cents } });
      toast('Cash limit saved');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const w = r.wallet;
  return (
    <div className="space-y-6">
      <Link href="/riders" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Riders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar src={r.user.avatarUrl} name={r.user.name ?? r.user.phone} size="lg" />
          <h1 className="text-2xl font-bold">{r.user.name ?? r.user.phone}</h1>
          <ApprovalBadge status={r.status} />
          {r.isOnline ? <Badge tone="green">Online</Badge> : <Badge>Offline</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status !== 'APPROVED' ? (
            <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setStatusModal('APPROVED')}>
              Approve
            </Button>
          ) : null}
          {r.status === 'PENDING' ? (
            <Button variant="secondary" icon={<XCircle className="h-4 w-4" />} onClick={() => setStatusModal('REJECTED')}>
              Reject
            </Button>
          ) : null}
          {r.status === 'APPROVED' ? (
            <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setStatusModal('SUSPENDED')}>
              Suspend
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Wallet balance" value={formatMoney(w.balanceCents)} hint={`Payable ${formatMoney(w.availableForPayoutCents)}`} tone="brand" />
        <StatCard label="Cash owed to DoorStep" value={formatMoney(w.cashOwedCents)} hint={`Limit ${formatMoney(w.cashLimitCents)} · ${formatMoney(w.cashLimitRemainingCents)} left`} tone={w.cashOwedCents > 0 ? 'alert' : 'default'} />
        <StatCard label="Deliveries" value={r.deliveries} />
        <StatCard label="Rating" value={r.ratingCount ? `${r.ratingAvg.toFixed(1)} ★` : '—'} hint={`${r.ratingCount} ratings`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3 text-sm">
          <h2 className="font-bold">Documents & vehicle</h2>
          {r.rejectionReason ? <p className="rounded-lg bg-alert-light px-3 py-2 text-alert">Rejected: {r.rejectionReason}</p> : null}
          <div>
            <p className="mb-1 font-semibold">Profile photo</p>
            {r.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.user.avatarUrl} alt={`${r.user.name ?? 'Rider'}`} className="h-40 w-40 rounded-xl border border-line object-cover" />
            ) : (
              <p className="text-muted">No photo uploaded.</p>
            )}
            <p className="mt-1 text-xs text-muted">Check it matches the face on the national ID.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 font-semibold">National ID · {r.nationalId}</p>
              <AuthImage src={r.idDocumentUrl} alt="National ID" className="h-36 w-full" />
            </div>
            <div>
              <p className="mb-1 font-semibold">Licence · {r.licenceNumber}</p>
              <AuthImage src={r.licenceDocumentUrl} alt="Driver's licence" className="h-36 w-full" />
              <p className="mt-1 text-xs text-muted">Expires {formatDate(r.licenceExpiry)}</p>
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-2">
            <strong>{vehicleLabel(r.vehicleType)}</strong>
            {[r.vehicleColor, r.vehicleMake, r.vehicleModel].filter(Boolean).join(' ')}
            {r.vehiclePlate ? <PlateBadge plate={r.vehiclePlate} /> : <span className="text-muted">No number plate (bicycle)</span>}
          </p>
          {r.vehiclePhotoUrl ? <AuthImage src={r.vehiclePhotoUrl} alt="Vehicle" className="h-40 w-full" /> : null}
          <p>
            <strong>Phone:</strong> {r.user.phone} · <strong>Zone:</strong> {r.zone?.name ?? '—'}
          </p>
          <p>
            <strong>Payout:</strong> {r.payoutMethod ? `${PAYMENT_METHOD_LABEL[r.payoutMethod]} · ${r.payoutAccount}` : 'not set'}
          </p>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-bold">Cash on delivery</h2>
            <Field label="Cash limit override (US$)" hint="Leave empty to use the platform default. Riders over their limit can't take cash orders.">
              <Input inputMode="decimal" value={cashLimit} onChange={(e) => setCashLimit(e.target.value)} placeholder={`Default ${centsToInput(w.cashLimitCents)}`} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" icon={<Banknote className="h-4 w-4" />} disabled={w.cashOwedCents <= 0} onClick={() => setRemitOpen(true)}>
                Record cash remittance
              </Button>
              <Button variant="secondary" icon={<Gift className="h-4 w-4" />} onClick={() => setAdjustOpen(true)}>
                Bonus / adjustment
              </Button>
              <Button loading={busy} onClick={() => void saveCashLimit()}>
                Save limit
              </Button>
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Cash collections</h2>
            {r.cashCollections.length === 0 ? (
              <p className="text-sm text-muted">No cash orders yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {r.cashCollections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span>
                      {c.order.code}
                      <span className="block text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                    </span>
                    <span className="text-right">
                      {formatMoney(c.amountCents)}
                      <span className="block">
                        <Badge tone={c.status === 'SETTLED' ? 'green' : 'yellow'}>
                          {c.status === 'SETTLED' ? 'settled' : `${formatMoney(c.amountCents - c.settledCents)} owed`}
                        </Badge>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <h2 className="mb-2 font-bold">Wallet ledger</h2>
        <ul className="divide-y divide-line text-sm">
          {r.transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span>
                {t.description}
                <span className="block text-xs text-muted">
                  {t.type.replace(/_/g, ' ').toLowerCase()} · {formatDateTime(t.createdAt)}
                </span>
              </span>
              <span className="text-right">
                <span className={`block font-semibold ${t.amountCents < 0 ? 'text-alert' : 'text-success'}`}>
                  {t.amountCents < 0 ? '−' : '+'}
                  {formatMoney(Math.abs(t.amountCents))}
                </span>
                <span className="text-xs text-muted">bal {formatMoney(t.balanceAfterCents)}</span>
              </span>
            </li>
          ))}
          {r.transactions.length === 0 ? <li className="py-2 text-muted">No transactions yet.</li> : null}
        </ul>
      </Card>

      <Modal
        open={Boolean(statusModal)}
        onClose={() => setStatusModal(null)}
        title={`${statusModal === 'APPROVED' ? 'Approve' : statusModal === 'REJECTED' ? 'Reject' : 'Suspend'} rider`}
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
        {statusModal === 'APPROVED' ? (
          <p className="text-sm">Confirm the ID, licence and vehicle match. The rider is notified and can then go online.</p>
        ) : (
          <Field label="Reason (sent to the rider)">
            <Textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <div className="mt-3">
          <InlineError message={err} />
        </div>
      </Modal>

      <AmountModal
        open={remitOpen}
        title="Record cash remittance"
        description={`Rider owes ${formatMoney(w.cashOwedCents)}. Record cash handed over or deposited.`}
        referenceLabel="Receipt / deposit reference"
        defaultAmount={centsToInput(w.cashOwedCents)}
        onClose={() => setRemitOpen(false)}
        onSubmit={async (amountCents, reference) => {
          await api(`/admin/riders/${r.id}/cash-remittance`, { body: { amountCents, reference } });
          toast('Remittance recorded');
          setRemitOpen(false);
          await reload();
        }}
      />
      <AdjustModal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onSubmit={async (body) => {
          await api(`/admin/riders/${r.id}/wallet-adjustment`, { body });
          toast('Wallet updated');
          setAdjustOpen(false);
          await reload();
        }}
      />
    </div>
  );
}

function AmountModal({
  open,
  title,
  description,
  referenceLabel,
  defaultAmount,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  referenceLabel: string;
  defaultAmount: string;
  onClose: () => void;
  onSubmit: (amountCents: number, reference: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setAmount(defaultAmount);
      setReference('');
      setError(null);
    }
  }, [open, defaultAmount]);

  const submit = async () => {
    const cents = parseMoneyToCents(amount);
    if (!cents) return setError('Enter a valid amount');
    if (!reference.trim()) return setError('Enter a reference');
    setPending(true);
    setError(null);
    try {
      await onSubmit(cents, reference.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{description}</p>
      <div className="space-y-3">
        <Field label="Amount (US$)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={referenceLabel}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

function AdjustModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: { type: 'BONUS' | 'ADJUSTMENT'; amountCents: number; description: string }) => Promise<void>;
}) {
  const [type, setType] = useState<'BONUS' | 'ADJUSTMENT'>('BONUS');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const cents = parseMoneyToCents(amount);
    if (!cents) return setError('Enter a valid amount');
    if (!description.trim()) return setError('Add a description');
    setPending(true);
    setError(null);
    try {
      await onSubmit({ type, amountCents: type === 'ADJUSTMENT' && direction === 'debit' ? -cents : cents, description: description.trim() });
      setAmount('');
      setDescription('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bonus or adjustment"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void submit()}>
            Post to wallet
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as 'BONUS' | 'ADJUSTMENT')}>
            <option value="BONUS">Bonus (credit)</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </Select>
        </Field>
        {type === 'ADJUSTMENT' ? (
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}>
              <option value="credit">Credit rider</option>
              <option value="debit">Debit rider</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Amount (US$)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Description (visible to the rider)">
          <Input value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
