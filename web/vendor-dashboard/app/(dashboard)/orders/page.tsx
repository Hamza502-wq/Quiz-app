'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bike, CheckCircle2, ChefHat, Clock, PackageCheck, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  OrderStatusBadge,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  Pagination,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  api,
  formatDateTime,
  formatMoney,
  formatTime,
  timeAgo,
  useApi,
  useInterval,
  useSocket,
  useSocketEvent,
  useToast,
  type Order,
  type Paged,
} from '@doorstep/web-shared';
import { playNewOrderChime } from '@/components/orderSound';

type Column = { key: string; title: string; icon: typeof Clock; statuses: Order['status'][] };

const COLUMNS: Column[] = [
  { key: 'new', title: 'New', icon: Clock, statuses: ['PLACED'] },
  { key: 'preparing', title: 'Preparing', icon: ChefHat, statuses: ['ACCEPTED'] },
  { key: 'ready', title: 'Ready for pickup', icon: PackageCheck, statuses: ['READY_FOR_PICKUP'] },
  { key: 'out', title: 'Out for delivery', icon: Bike, statuses: ['PICKED_UP', 'ON_THE_WAY'] },
];

const PREP_PRESETS = [10, 15, 20, 30, 45];

export default function OrdersPage() {
  const [tab, setTab] = useState<'board' | 'history'>('board');
  return (
    <div>
      <PageHeader title="Orders" subtitle="Accept new orders, set preparation time and mark them ready for pickup." />
      <Tabs
        tabs={[
          { value: 'board', label: 'Live board' },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'board' ? <Board /> : <History />}
    </div>
  );
}

function Board() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<Paged<Order>>('/vendor/orders', { status: 'active', pageSize: 100 });
  const [accepting, setAccepting] = useState<Order | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [viewing, setViewing] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const upsert = useCallback(
    (order: Order) => {
      setData((prev) => {
        const items = prev?.items ?? [];
        const active = ['PLACED', 'ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'].includes(order.status);
        const without = items.filter((o) => o.id !== order.id);
        const next = active ? [order, ...without] : without;
        return { ...(prev ?? { page: 1, pageSize: 100, totalPages: 1 }), items: next, total: next.length } as Paged<Order>;
      });
    },
    [setData],
  );

  useSocketEvent<{ id: string; code: string }>('vendor:new_order', (payload) => {
    playNewOrderChime();
    toast(`New order ${payload.code}!`, 'info');
    void reload();
  });
  useSocketEvent<Order>('order:updated', (order) => {
    if (order && 'status' in order && 'items' in order) upsert(order);
  });
  // Polling: a safety net while live updates are on, the main source when they're off.
  const { connected } = useSocket();
  useInterval(() => void reload(), connected ? 30_000 : 6_000);

  // Without live updates, announce orders that appear between polls.
  const seenOrderIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const placed = data.items.filter((o) => o.status === 'PLACED');
    const seen = seenOrderIds.current;
    if (seen && !connected) {
      const fresh = placed.filter((o) => !seen.has(o.id));
      if (fresh.length > 0) {
        playNewOrderChime();
        toast(fresh.length === 1 ? `New order ${fresh[0].code}!` : `${fresh.length} new orders!`, 'info');
      }
    }
    seenOrderIds.current = new Set([...(seen ?? []), ...data.items.map((o) => o.id)]);
  }, [data, connected, toast]);

  const grouped = useMemo(() => {
    const byCol: Record<string, Order[]> = {};
    for (const col of COLUMNS) byCol[col.key] = [];
    for (const o of data?.items ?? []) {
      const col = COLUMNS.find((c) => c.statuses.includes(o.status));
      if (col) byCol[col.key].push(o);
    }
    for (const key of Object.keys(byCol)) {
      byCol[key].sort((a, b) => new Date(a.timestamps.placedAt ?? a.timestamps.createdAt).getTime() - new Date(b.timestamps.placedAt ?? b.timestamps.createdAt).getTime());
    }
    return byCol;
  }, [data]);

  const markReady = async (order: Order) => {
    setBusyId(order.id);
    try {
      upsert(await api<Order>(`/vendor/orders/${order.id}/ready`, { method: 'POST' }));
      toast(`${order.code} marked ready for pickup`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update order', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading orders…" />;
  if (error && !data) return <ErrorState message={error.message} onRetry={() => void reload()} />;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <section key={col.key} className="flex min-h-[200px] flex-col rounded-2xl bg-white/60 p-3 ring-1 ring-line">
            <header className="mb-3 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 font-bold">
                <col.icon className="h-4 w-4 text-brand" /> {col.title}
              </h2>
              <Badge tone={col.key === 'new' && grouped[col.key].length ? 'orange' : 'gray'}>{grouped[col.key].length}</Badge>
            </header>
            <div className="flex flex-1 flex-col gap-3">
              {grouped[col.key].length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">Nothing here</p>
              ) : (
                grouped[col.key].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    busy={busyId === order.id}
                    onOpen={() => setViewing(order)}
                    onAccept={() => setAccepting(order)}
                    onReject={() => setRejecting(order)}
                    onReady={() => void markReady(order)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <AcceptModal order={accepting} onClose={() => setAccepting(null)} onDone={(o) => { upsert(o); setAccepting(null); toast(`${o.code} accepted`); }} />
      <RejectModal order={rejecting} onClose={() => setRejecting(null)} onDone={(o) => { upsert(o); setRejecting(null); toast(`${o.code} rejected`, 'info'); }} />
      <OrderDetailModal order={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function OrderCard({
  order,
  busy,
  onOpen,
  onAccept,
  onReject,
  onReady,
}: {
  order: Order;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onReady: () => void;
}) {
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const isNew = order.status === 'PLACED';
  return (
    <Card className={`p-4 ${isNew ? 'ring-2 ring-brand' : ''}`}>
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold">{order.code}</p>
            <p className="text-xs text-muted">{timeAgo(order.timestamps.placedAt ?? order.timestamps.createdAt)}</p>
          </div>
          <p className="font-bold text-brand">{formatMoney(order.amounts.subtotalCents)}</p>
        </div>
        <ul className="mt-2 space-y-0.5 text-sm">
          {order.items.slice(0, 4).map((i) => (
            <li key={i.id} className="truncate">
              <span className="font-semibold">{i.quantity}×</span> {i.name}
            </li>
          ))}
          {order.items.length > 4 ? <li className="text-xs text-muted">+{order.items.length - 4} more</li> : null}
        </ul>
        {order.notes ? <p className="mt-2 rounded-lg bg-warning-light px-2 py-1 text-xs">📝 {order.notes}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted">
          <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span>
          {order.estimatedReadyAt && order.status === 'ACCEPTED' ? (
            <>
              <span>·</span>
              <span className="font-semibold text-ink">Ready by {formatTime(order.estimatedReadyAt)}</span>
            </>
          ) : null}
        </div>
        {order.rider ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink-soft">
            <Bike className="h-3.5 w-3.5" /> {order.rider.name} · {order.rider.vehiclePlate}
          </p>
        ) : order.status !== 'PLACED' ? (
          <p className="mt-2 text-xs text-muted">Finding a rider…</p>
        ) : null}
      </button>
      {order.status === 'PLACED' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" icon={<XCircle className="h-4 w-4" />} onClick={onReject}>
            Reject
          </Button>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={onAccept}>
            Accept
          </Button>
        </div>
      ) : null}
      {order.status === 'ACCEPTED' ? (
        <Button className="mt-3 w-full" size="sm" variant="dark" loading={busy} icon={<PackageCheck className="h-4 w-4" />} onClick={onReady}>
          Mark ready
        </Button>
      ) : null}
    </Card>
  );
}

function AcceptModal({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: (o: Order) => void }) {
  const [minutes, setMinutes] = useState('15');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!order) return;
    const prepMinutes = Number(minutes);
    if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 180) return setError('Enter 1–180 minutes');
    setPending(true);
    setError(null);
    try {
      onDone(await api<Order>(`/vendor/orders/${order.id}/accept`, { body: { prepMinutes } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={`Accept ${order?.code ?? ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={pending}>
            Accept order
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">How long until it&apos;s ready for the rider?</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {PREP_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMinutes(String(m))}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${minutes === String(m) ? 'border-brand bg-brand-light text-brand' : 'border-line'}`}
          >
            {m} min
          </button>
        ))}
      </div>
      <Field label="Preparation time (minutes)">
        <Input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </Field>
      <div className="mt-3">
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

const REJECT_REASONS = ['Item(s) out of stock', 'Too busy right now', 'Closing soon', 'Cannot prepare this order'];

function RejectModal({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: (o: Order) => void }) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!order) return;
    if (!reason.trim()) return setError('Tell the customer why');
    setPending(true);
    setError(null);
    try {
      onDone(await api<Order>(`/vendor/orders/${order.id}/reject`, { body: { reason: reason.trim() } }));
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={`Reject ${order?.code ?? ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={pending}>
            Reject order
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {REJECT_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand">
            {r}
          </button>
        ))}
      </div>
      <Field label="Reason (shared with the customer)">
        <Textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="mt-2 text-xs text-muted">Paid orders are refunded to the customer automatically.</p>
      <div className="mt-3">
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

function OrderDetailModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(order)} onClose={onClose} title={order ? `Order ${order.code}` : ''}>
      {order ? (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <OrderStatusBadge status={order.status} />
            <span className="text-muted">{formatDateTime(order.timestamps.placedAt ?? order.timestamps.createdAt)}</span>
          </div>
          <div>
            <p className="font-semibold">Customer</p>
            <p>{order.customer?.name}</p>
          </div>
          <table className="w-full">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b border-line">
                  <td className="py-2 pr-2 font-semibold">{i.quantity}×</td>
                  <td className="py-2">
                    {i.name}
                    {i.notes ? <span className="block text-xs text-muted">{i.notes}</span> : null}
                  </td>
                  <td className="py-2 text-right">{formatMoney(i.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-semibold">{formatMoney(order.amounts.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">DoorStep commission ({((order.amounts.commissionRateBps ?? 0) / 100).toFixed(1)}%)</dt>
              <dd>−{formatMoney(order.amounts.commissionCents ?? 0)}</dd>
            </div>
            <div className="flex justify-between text-base">
              <dt className="font-bold">Your earnings</dt>
              <dd className="font-bold text-brand">{formatMoney(order.amounts.vendorEarningCents ?? 0)}</dd>
            </div>
          </dl>
          {order.notes ? <p className="rounded-lg bg-warning-light px-3 py-2">📝 {order.notes}</p> : null}
          {order.rider ? (
            <div className="rounded-xl bg-canvas p-3">
              <p className="font-semibold">Rider</p>
              <p>
                {order.rider.name} · {order.rider.vehicleDescription} · <strong>{order.rider.vehiclePlate}</strong>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function History() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | 'DELIVERED' | 'CANCELLED' | 'REJECTED'>('');
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi<Paged<Order>>('/vendor/orders', { page, pageSize: 20, status: status || undefined, q: q || undefined });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search order code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-xs" />
        <select
          className="rounded-xl border border-line bg-white px-3 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No orders found" message="Orders you receive will appear here." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Date</Th>
                <Th>Items</Th>
                <Th>Status</Th>
                <Th className="text-right">Subtotal</Th>
                <Th className="text-right">Your earnings</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <Td className="font-semibold">{o.code}</Td>
                  <Td>{formatDateTime(o.timestamps.placedAt ?? o.timestamps.createdAt)}</Td>
                  <Td>{o.items.reduce((s, i) => s + i.quantity, 0)}</Td>
                  <Td>
                    <OrderStatusBadge status={o.status} />
                  </Td>
                  <Td className="text-right">{formatMoney(o.amounts.subtotalCents)}</Td>
                  <Td className="text-right font-semibold">{o.status === 'DELIVERED' ? formatMoney(o.amounts.vendorEarningCents ?? 0) : '—'}</Td>
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
