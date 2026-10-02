'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Bike, Phone, UserX, XCircle } from 'lucide-react';
import {
  AuthImage,
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  InlineError,
  LoadingBlock,
  Modal,
  OrderStatusBadge,
  PAYMENT_METHOD_LABEL,
  PaymentStatusBadge,
  PlateBadge,
  Textarea,
  api,
  formatDateTime,
  formatMoney,
  useApi,
  useInterval,
  useSocket,
  useSocketEvent,
  useToast,
  type Order,
} from '@doorstep/web-shared';
import { AssignRiderModal } from '@/components/AssignRiderModal';

interface AdminOrder extends Order {
  offers: Array<{ id: string; riderId: string; riderName: string | null; status: string; isManual: boolean; distanceKm: number | null; createdAt: string; respondedAt: string | null }>;
  paymentsAll: Array<{ id: string; purpose: string; method: string; status: Order['paymentStatus']; currency: string; amountCents: number; reference: string; paynowReference: string | null; createdAt: string }>;
  refunds: Array<{ id: string; amountCents: number; method: string; status: string; reference: string | null; notes: string | null; createdAt: string }>;
}

const REASSIGNABLE = ['PLACED', 'ACCEPTED', 'READY_FOR_PICKUP'];
const CANCELLABLE = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'];

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock variant="detail" />}>
      <OrderDetailView />
    </Suspense>
  );
}

function OrderDetailView() {
  const id = useSearchParams().get('id') ?? '';
  const toast = useToast();
  const { data: order, error, loading, reload } = useApi<AdminOrder>(id ? `/admin/orders/${encodeURIComponent(id)}` : null);
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useSocketEvent<Order>('order:updated', (o) => {
    if (o?.id === id) void reload();
  });
  const { connected } = useSocket();
  useInterval(() => void reload(), connected ? null : 8_000);

  if (loading && !order) return <LoadingBlock variant="detail" />;
  if (error || !order) return <ErrorState message={error?.message ?? 'Order not found'} onRetry={() => void reload()} />;

  const unassign = async () => {
    setBusy(true);
    try {
      await api(`/admin/orders/${order.id}/unassign`, { method: 'POST' });
      toast('Rider unassigned');
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not unassign', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!reason.trim()) return setActionError('Enter a reason');
    setBusy(true);
    setActionError(null);
    try {
      await api(`/admin/orders/${order.id}/cancel`, { body: { reason: reason.trim() } });
      toast(`${order.code} cancelled`);
      setCancelling(false);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const a = order.amounts;
  return (
    <div className="space-y-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{order.code}</h1>
          <OrderStatusBadge status={order.status} />
          {order.type === 'PARCEL' ? <Badge tone="dark">Parcel</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {REASSIGNABLE.includes(order.status) && !order.rider ? (
            <Button icon={<Bike className="h-4 w-4" />} onClick={() => setAssigning(true)}>
              Assign rider
            </Button>
          ) : null}
          {REASSIGNABLE.includes(order.status) && order.rider ? (
            <Button variant="secondary" icon={<UserX className="h-4 w-4" />} loading={busy} onClick={() => void unassign()}>
              Unassign rider
            </Button>
          ) : null}
          {CANCELLABLE.includes(order.status) ? (
            <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setCancelling(true)}>
              Cancel order
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-3 font-bold">Items</h2>
            {order.type === 'PARCEL' ? (
              <p className="text-sm">
                {order.parcel?.size?.toLowerCase()} parcel — {order.parcel?.description}
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-b border-line">
                      <td className="py-2 font-semibold">{i.quantity}×</td>
                      <td className="py-2">
                        {i.name}
                        {i.notes ? <span className="block text-xs text-muted">{i.notes}</span> : null}
                      </td>
                      <td className="py-2 text-right">{formatMoney(i.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <dl className="mt-3 space-y-1 text-sm">
              <Row label="Subtotal" value={formatMoney(a.subtotalCents)} />
              <Row label="Delivery fee" value={formatMoney(a.deliveryFeeCents)} />
              <Row label="Tip" value={formatMoney(a.tipCents)} />
              <Row label="Total" value={`${formatMoney(a.totalCents)}${a.currency === 'ZWG' ? ` · ${formatMoney(a.totalLocalCents, 'ZWG')} @ ${a.exchangeRate}` : ''}`} bold />
              <Row label={`Commission (${((a.commissionRateBps ?? 0) / 100).toFixed(1)}%)`} value={formatMoney(a.commissionCents ?? 0)} />
              <Row label="Vendor earning" value={formatMoney(a.vendorEarningCents ?? 0)} />
              <Row label="Rider pay" value={formatMoney(a.riderEarningCents ?? 0)} />
            </dl>
            {order.notes ? <p className="mt-3 rounded-lg bg-warning-light px-3 py-2 text-sm">📝 {order.notes}</p> : null}
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Timeline</h2>
            <ol className="relative space-y-3 border-l-2 border-line pl-5 text-sm">
              {(order.events ?? []).map((e) => (
                <li key={e.id}>
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-brand" />
                  <p className="font-semibold">{e.message ?? e.type}</p>
                  <p className="text-xs text-muted">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Dispatch offers</h2>
            {order.offers.length === 0 ? (
              <p className="text-sm text-muted">No offers yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {order.offers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <span>
                      {o.riderName ?? o.riderId} {o.isManual ? <Badge tone="dark">manual</Badge> : null}
                      <span className="block text-xs text-muted">
                        {formatDateTime(o.createdAt)}
                        {o.distanceKm !== null ? ` · ${o.distanceKm.toFixed(1)} km from pickup` : ''}
                      </span>
                    </span>
                    <Badge tone={o.status === 'ACCEPTED' ? 'green' : o.status === 'OFFERED' ? 'orange' : 'gray'}>{o.status.toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3 text-sm">
            <h2 className="font-bold">People</h2>
            <Person title="Customer" name={order.customer?.name} phone={order.customer?.phone} photoUrl={order.customer?.photoUrl} />
            {order.vendor ? <Person title="Shop" name={order.vendor.name} phone={order.vendor.phone} photoUrl={order.vendor.logoUrl} square /> : null}
            {order.rider ? (
              <Person title="Rider" name={order.rider.name} phone={order.rider.phone} photoUrl={order.rider.photoUrl} plate={order.rider.vehiclePlate} />
            ) : (
              <p className="text-muted">No rider assigned.</p>
            )}
          </Card>
          <Card className="space-y-3 text-sm">
            <h2 className="font-bold">Route · {order.distanceKm.toFixed(1)} km</h2>
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Pickup</p>
              <p>{order.pickup.address}</p>
              {order.pickup.landmark ? <p className="text-muted">{order.pickup.landmark}</p> : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Drop-off</p>
              <p>{order.dropoff.address}</p>
              <p className="font-semibold text-alert">📍 {order.dropoff.landmark}</p>
              {order.dropoff.recipientName ? (
                <p className="text-muted">
                  For {order.dropoff.recipientName} {order.dropoff.recipientPhone}
                </p>
              ) : null}
            </div>
          </Card>
          <Card className="space-y-2 text-sm">
            <h2 className="font-bold">Payments</h2>
            {order.paymentsAll.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span>
                  {PAYMENT_METHOD_LABEL[p.method] ?? p.method} {p.purpose === 'TIP' ? '(tip)' : ''}
                  <span className="block text-xs text-muted">
                    {p.reference}
                    {p.paynowReference ? ` · Paynow ${p.paynowReference}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{formatMoney(p.amountCents, p.currency === 'ZWG' ? 'ZWG' : 'USD')}</span>
                  <PaymentStatusBadge status={p.status} />
                </span>
              </div>
            ))}
            {order.refunds.length ? (
              <>
                <h3 className="pt-2 font-semibold">Refunds</h3>
                {order.refunds.map((r) => (
                  <div key={r.id} className="flex justify-between">
                    <span>
                      {r.method} {r.reference ? `· ${r.reference}` : ''}
                    </span>
                    <span>
                      {formatMoney(r.amountCents)} <Badge tone={r.status === 'COMPLETED' ? 'green' : 'yellow'}>{r.status.toLowerCase()}</Badge>
                    </span>
                  </div>
                ))}
              </>
            ) : null}
          </Card>
          {order.proof ? (
            <Card className="space-y-2 text-sm">
              <h2 className="font-bold">Proof of delivery</h2>
              {order.proof.type === 'PIN' ? <p>Customer PIN confirmed ✅</p> : <AuthImage src={order.proof.photoUrl} alt="Delivery proof" className="h-56 w-full" />}
            </Card>
          ) : null}
          {order.dispute ? (
            <Card className="space-y-1 text-sm">
              <h2 className="font-bold">Dispute</h2>
              <Badge tone={order.dispute.status === 'OPEN' ? 'red' : 'green'}>{order.dispute.status.toLowerCase()}</Badge>
              <p className="font-semibold">{order.dispute.reason.replace(/_/g, ' ').toLowerCase()}</p>
              <p>{order.dispute.description}</p>
              {order.dispute.resolution ? <p className="text-muted">Resolution: {order.dispute.resolution}</p> : null}
              <Link href="/disputes" className="font-semibold text-brand hover:underline">
                Manage disputes →
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      <AssignRiderModal
        order={assigning ? order : null}
        onClose={() => setAssigning(false)}
        onAssigned={() => {
          setAssigning(false);
          void reload();
        }}
      />
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${order.code}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(false)}>
              Keep order
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void cancel()}>
              Cancel order
            </Button>
          </>
        }
      >
        <Field label="Reason (sent to the customer)">
          <Textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-muted">Stock is returned to the vendor. Online payments get a pending refund.</p>
        <div className="mt-3">
          <InlineError message={actionError} />
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-bold' : ''}`}>
      <dt className={bold ? '' : 'text-muted'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Person({
  title,
  name,
  phone,
  photoUrl,
  plate,
  square,
}: {
  title: string;
  name?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  plate?: string | null;
  square?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar src={photoUrl} name={name ?? title} size="md" square={square} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted">{title}</p>
        <p className="font-semibold">{name ?? '—'}</p>
        {plate ? <PlateBadge plate={plate} className="mt-0.5" /> : null}
        {phone ? (
          <a href={`tel:${phone}`} className="flex items-center gap-1 text-brand hover:underline">
            <Phone className="h-3.5 w-3.5" /> {phone}
          </a>
        ) : null}
      </div>
    </div>
  );
}
