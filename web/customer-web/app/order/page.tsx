'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bike, KeyRound, MapPin, MessageCircle, Phone, RotateCcw, Star, Store, TriangleAlert } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  OrderStatusBadge,
  PAYMENT_METHOD_LABEL,
  PaymentStatusBadge,
  PlateBadge,
  api,
  config,
  formatDateTime,
  formatMoney,
  useApi,
  useInterval,
  useSocket,
  useSocketEvent,
  useToast,
  vehicleLabel,
  type LatLng,
} from '@doorstep/web-shared';
import { useCart } from '@/lib/cart';
import { DEMO_MODE } from '@/lib/demo/mode';
import { etaLabel, formatIn } from '@/lib/format';
import type { CustomerOrder, PaymentInfo, ReorderResult, RiderLocationEvent, TrackingSnapshot } from '@/lib/types';
import { RequireCustomer } from '@/components/RequireCustomer';
import { OrderProgress } from '@/components/OrderProgress';
import { TrackingMap } from '@/components/TrackingMap';
import { ChatPanel } from '@/components/ChatPanel';
import { OnlinePaymentForm, PaymentStatusView, TipModal, usePaymentStatus } from '@/components/Payments';
import { CancelOrderModal, DisputeModal, RateOrderModal } from '@/components/OrderDialogs';

const TERMINAL = ['DELIVERED', 'REJECTED', 'CANCELLED'];
const RIDER_MOVING = ['PICKED_UP', 'ON_THE_WAY'];

export default function OrderPage() {
  return (
    <RequireCustomer>
      <Suspense fallback={<LoadingBlock label="Loading your order…" variant="detail" />}>
        <OrderDetail />
      </Suspense>
    </RequireCustomer>
  );
}

function OrderDetail() {
  const id = useSearchParams().get('id') ?? '';
  const order = useApi<CustomerOrder>(id ? `/orders/${encodeURIComponent(id)}` : null);

  if (!id || (order.error && !order.data)) {
    if (!id || order.error?.status === 404 || order.error?.status === 403) {
      return (
        <div className="mx-auto max-w-xl px-4 py-16">
          <EmptyState title="Order not found" message="Check the link, or find the order in your order history." action={<Link href="/orders" className="font-semibold text-brand hover:underline">Your orders</Link>} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState message={order.error?.message ?? 'Could not load the order'} onRetry={() => void order.reload()} />
      </div>
    );
  }
  if (!order.data) return <LoadingBlock label="Loading your order…" variant="detail" />;
  return <OrderView order={order.data} setOrder={(o) => order.setData(o)} reload={order.reload} />;
}

function OrderView({ order, setOrder, reload }: { order: CustomerOrder; setOrder: (o: CustomerOrder) => void; reload: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const { socket, connected } = useSocket();
  const active = !TERMINAL.includes(order.status);
  const [riderPos, setRiderPos] = useState<LatLng | null>(order.rider?.location ? { lat: order.rider.location.lat, lng: order.rider.location.lng } : null);
  const [eta, setEta] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | 'cancel' | 'rate' | 'tip' | 'dispute'>(null);
  const [reordering, setReordering] = useState(false);

  // Join the order's room for live rider positions (re-join after reconnects).
  useEffect(() => {
    if (!socket || !connected || !active) return;
    socket.emit('order:subscribe', { orderId: order.id });
    return () => {
      socket.emit('order:unsubscribe', { orderId: order.id });
    };
  }, [socket, connected, active, order.id]);

  useSocketEvent<CustomerOrder>('order:updated', (o) => {
    if (o.id === order.id) setOrder(o);
  });
  useSocketEvent<RiderLocationEvent>('order:rider_location', (e) => {
    if (e.orderId !== order.id) return;
    setRiderPos({ lat: e.lat, lng: e.lng });
    if (e.etaMinutes !== null) setEta(e.etaMinutes);
  });

  useEffect(() => {
    if (order.rider?.location) setRiderPos({ lat: order.rider.location.lat, lng: order.rider.location.lng });
  }, [order.rider?.location]);

  // ETA + low-data fallback: poll the tracking snapshot; reload the order when the socket is down.
  const pollTracking = useCallback(async () => {
    try {
      const t = await api<TrackingSnapshot>(`/orders/${order.id}/tracking`);
      setEta(t.etaMinutes);
      if (t.rider?.location) setRiderPos({ lat: t.rider.location.lat, lng: t.rider.location.lng });
      // Reload when the status changes or a rider is assigned.
      if (t.status !== order.status || Boolean(t.rider) !== Boolean(order.rider)) void reload();
    } catch {
      // Keep the last known values.
    }
  }, [order.id, order.status, order.rider, reload]);
  useEffect(() => {
    if (active && order.status !== 'PENDING_PAYMENT') void pollTracking();
    // Initial snapshot for this status.
  }, [active, order.status, pollTracking]);
  useInterval(
    () => void pollTracking(),
    active && order.status !== 'PENDING_PAYMENT' ? (DEMO_MODE ? 3_000 : connected ? 60_000 : config.realtime ? 20_000 : 6_000) : null,
  );

  const orderAgain = async () => {
    setReordering(true);
    try {
      const r = await api<ReorderResult>(`/orders/${order.id}/reorder`, { method: 'POST' });
      if (r.items.length === 0) {
        toast('None of these items are available right now.', 'error');
        return;
      }
      cart.replace(
        { id: r.vendorId, name: r.vendorName ?? order.vendor?.name ?? 'Store', slug: r.vendorId },
        r.items.map((i) => ({ productId: i.productId, name: i.name, priceCents: i.priceCents, quantity: i.quantity, thumbUrl: null, notes: null })),
      );
      if (r.unavailable.length) toast(`Not available any more: ${r.unavailable.join(', ')}`, 'info');
      else if (r.items.some((i) => i.priceChanged)) toast('Some prices have changed since your last order.', 'info');
      router.push('/cart');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reorder', 'error');
    } finally {
      setReordering(false);
    }
  };

  const fmt = (usd: number) => formatIn(usd, order.amounts.currency, order.amounts.exchangeRate);
  const canCancel = order.status === 'PENDING_PAYMENT' || order.status === 'PLACED';
  const canReport = order.status !== 'PENDING_PAYMENT' && !order.dispute;
  const showPin = Boolean(order.deliveryPin) && ['PLACED', 'ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'].includes(order.status);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/orders" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Your orders
      </Link>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{order.type === 'PARCEL' ? 'Parcel delivery' : order.vendor?.name}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Order {order.code} · {formatDateTime(order.timestamps.createdAt)}
          </p>
        </div>
        {active && order.status !== 'PENDING_PAYMENT' ? (
          <div className="rounded-xl bg-brand-light px-4 py-2 text-right">
            <p className="text-xs text-brand-dark">Estimated arrival</p>
            <p className="text-xl font-bold text-brand">{eta !== null ? etaLabel(eta) : '…'}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {order.status === 'PENDING_PAYMENT' ? <PaymentDue order={order} onPaid={() => void reload()} /> : null}

          {order.status === 'REJECTED' || order.status === 'CANCELLED' ? (
            <Card className="border-alert/30 bg-alert-light/40">
              <div className="flex gap-3">
                <TriangleAlert className="h-5 w-5 shrink-0 text-alert" aria-hidden />
                <div className="text-sm">
                  <p className="font-semibold">{order.status === 'REJECTED' ? 'The store could not take this order' : 'This order was cancelled'}</p>
                  {order.rejectReason || order.cancelReason ? <p className="mt-1 text-ink-soft">{order.rejectReason ?? order.cancelReason}</p> : null}
                  {order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED' ? (
                    <p className="mt-1 text-ink-soft">
                      {order.paymentStatus === 'PAID' ? 'Your online payment will be refunded.' : 'Your payment has been refunded.'}
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : order.status !== 'PENDING_PAYMENT' ? (
            <Card>
              <OrderProgress order={order} />
              {order.status === 'ACCEPTED' && order.estimatedReadyAt ? (
                <p className="mt-4 text-sm text-muted">The store expects it to be ready around {formatDateTime(order.estimatedReadyAt)}.</p>
              ) : null}
            </Card>
          ) : null}

          {showPin ? (
            <Card className="flex items-center gap-4 border-brand/30 bg-brand-light/40">
              <KeyRound className="h-8 w-8 shrink-0 text-brand" aria-hidden />
              <div>
                <p className="text-sm text-ink-soft">Your delivery PIN — give it to the rider when your order arrives</p>
                <p className="text-3xl font-bold tracking-[0.3em] text-ink">{order.deliveryPin}</p>
              </div>
            </Card>
          ) : null}

          {active && order.status !== 'PENDING_PAYMENT' ? (
            <TrackingMap
              pickup={{ lat: order.pickup.lat, lng: order.pickup.lng }}
              dropoff={{ lat: order.dropoff.lat, lng: order.dropoff.lng }}
              rider={RIDER_MOVING.includes(order.status) ? riderPos : null}
              className="h-80"
            />
          ) : null}

          {order.rider ? (
            <Card>
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative">
                  <Avatar src={order.rider.photoUrl} name={order.rider.name ?? 'Rider'} size="lg" />
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-ink text-white">
                    <Bike className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{order.rider.name ?? 'Your rider'}</p>
                  {order.rider.vehiclePlate ? (
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <PlateBadge plate={order.rider.vehiclePlate} /> Check the plate before you hand over your PIN
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted">
                    {order.rider.vehicleDescription || vehicleLabel(order.rider.vehicleType)}
                    {order.rider.ratingAvg > 0 ? (
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <Star className="h-3.5 w-3.5 fill-flag-yellow text-flag-yellow" aria-hidden /> {order.rider.ratingAvg.toFixed(1)}
                      </span>
                    ) : null}
                  </p>
                </div>
                {order.rider.phone && active ? (
                  <a href={`tel:${order.rider.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-brand hover:text-brand">
                    <Phone className="h-4 w-4" aria-hidden /> Call
                  </a>
                ) : null}
              </div>
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <MessageCircle className="h-4 w-4 text-brand" aria-hidden /> Chat with your rider
                </p>
                <ChatPanel orderId={order.id} canSend={active} />
              </div>
            </Card>
          ) : null}

          {order.dispute ? (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Problem reported</p>
                <Badge tone={order.dispute.status === 'RESOLVED' ? 'green' : order.dispute.status === 'REJECTED' ? 'gray' : 'yellow'}>
                  {order.dispute.status.replace(/_/g, ' ').toLowerCase()}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{order.dispute.description}</p>
              {order.dispute.resolution ? <p className="mt-2 text-sm"><span className="font-semibold">Support:</span> {order.dispute.resolution}</p> : null}
              {order.dispute.refundCents ? <p className="mt-1 text-sm text-success">Refund: {formatMoney(order.dispute.refundCents)}</p> : null}
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card className="space-y-4">
            <div className="flex gap-3 text-sm">
              {order.type === 'PARCEL' ? <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden /> : <Store className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />}
              <div className="min-w-0">
                <p className="text-xs text-muted">{order.type === 'PARCEL' ? 'Pickup' : 'From'}</p>
                <p className="font-semibold">{order.type === 'PARCEL' ? order.pickup.address : order.vendor?.name}</p>
                {order.pickup.landmark ? <p className="text-xs text-muted">{order.pickup.landmark}</p> : null}
              </div>
            </div>
            <div className="flex gap-3 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-alert" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs text-muted">Deliver to{order.dropoff.recipientName ? ` ${order.dropoff.recipientName}` : ''}</p>
                <p className="font-semibold">{order.dropoff.address}</p>
                <p className="text-xs text-muted">{order.dropoff.landmark}</p>
              </div>
            </div>

            {order.type === 'PARCEL' ? (
              <p className="border-t border-line pt-3 text-sm">
                <span className="text-muted">Parcel:</span> {order.parcel?.description}
                {order.parcel?.size ? ` (${order.parcel.size.toLowerCase()})` : ''}
              </p>
            ) : (
              <ul className="space-y-1.5 border-t border-line pt-3 text-sm">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>
                      <span className="font-semibold">{i.quantity}×</span> {i.name}
                      {i.notes ? <span className="block text-xs italic text-muted">“{i.notes}”</span> : null}
                    </span>
                    <span className="shrink-0">{fmt(i.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t border-line pt-3 text-sm">
              {order.type === 'DELIVERY' ? <Row label="Items" value={fmt(order.amounts.subtotalCents)} /> : null}
              <Row label={`Delivery (${order.distanceKm.toFixed(1)} km)`} value={fmt(order.amounts.deliveryFeeCents)} />
              {order.amounts.tipCents > 0 ? <Row label="Rider tip" value={fmt(order.amounts.tipCents)} /> : null}
              <div className="flex justify-between pt-1 text-base font-bold">
                <span>Total</span>
                <span>{fmt(order.amounts.totalCents)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">{PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}</span>
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
            {order.notes ? <p className="text-xs text-muted">Your note: “{order.notes}”</p> : null}
          </Card>

          <div className="flex flex-col gap-2">
            {order.canRate ? (
              <Button icon={<Star className="h-4 w-4" />} onClick={() => setDialog('rate')}>
                Rate this order
              </Button>
            ) : null}
            {order.status === 'DELIVERED' && order.rider ? (
              <Button variant="secondary" onClick={() => setDialog('tip')}>
                Tip your rider
              </Button>
            ) : null}
            {order.type === 'DELIVERY' && !active ? (
              <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={reordering} onClick={() => void orderAgain()}>
                Order again
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="ghost" className="text-alert" onClick={() => setDialog('cancel')}>
                Cancel order
              </Button>
            ) : null}
            {canReport ? (
              <Button variant="ghost" onClick={() => setDialog('dispute')}>
                Report a problem
              </Button>
            ) : null}
          </div>
        </aside>
      </div>

      <CancelOrderModal orderId={order.id} open={dialog === 'cancel'} onClose={() => setDialog(null)} onCancelled={setOrder} />
      <RateOrderModal order={order} open={dialog === 'rate'} onClose={() => setDialog(null)} onRated={() => void reload()} />
      <TipModal orderId={order.id} open={dialog === 'tip'} onClose={() => setDialog(null)} />
      <DisputeModal orderId={order.id} open={dialog === 'dispute'} onClose={() => setDialog(null)} onReported={() => void reload()} />
    </div>
  );
}

/** Order created but not yet paid: live payment status plus start/retry. */
function PaymentDue({ order, onPaid }: { order: CustomerOrder; onPaid: () => void }) {
  const initial: PaymentInfo | null = order.payment
    ? {
        id: order.payment.id,
        orderId: order.id,
        purpose: 'ORDER',
        method: order.payment.method,
        status: order.payment.status,
        currency: order.payment.currency,
        amountCents: order.payment.amountCents,
        amountUsdCents: order.amounts.totalCents,
        reference: order.payment.paynowReference ?? '',
        redirectUrl: order.payment.redirectUrl ?? null,
        instructions: order.payment.instructions ?? null,
        paidAt: null,
        createdAt: order.timestamps.createdAt,
      }
    : null;
  const [seed, setSeed] = useState(initial);
  const [retrying, setRetrying] = useState(false);
  const { payment, timedOut } = usePaymentStatus(seed, (p) => {
    if (p.status === 'PAID') onPaid();
  });
  const showForm = retrying || !payment || (payment.status !== 'PENDING' && payment.status !== 'PAID');
  const method = order.paymentMethod === 'CASH' ? 'ECOCASH' : order.paymentMethod;

  return (
    <Card className="space-y-4 border-brand/40">
      <div>
        <h2 className="text-lg font-bold">Complete your payment</h2>
        <p className="text-sm text-muted">The store gets your order as soon as the payment goes through. Unpaid orders are cancelled after a while.</p>
      </div>
      {payment && !retrying ? <PaymentStatusView payment={payment} timedOut={timedOut} /> : null}
      {showForm ? (
        <OnlinePaymentForm
          initialMethod={method}
          submitLabel={payment ? 'Try again' : 'Pay now'}
          onSubmit={async (m, payerPhone) => {
            const p = await api<PaymentInfo>(`/orders/${order.id}/pay`, { body: { method: m, payerPhone } });
            setSeed(p);
            setRetrying(false);
          }}
        />
      ) : payment?.status === 'PENDING' ? (
        <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setRetrying(true)}>
          Use a different payment method
        </button>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
