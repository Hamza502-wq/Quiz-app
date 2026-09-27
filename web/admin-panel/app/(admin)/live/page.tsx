'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, MapPin } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingBlock,
  OrderStatusBadge,
  PageHeader,
  Tabs,
  timeAgo,
  useApi,
  useInterval,
  useSocketEvent,
  type Order,
} from '@doorstep/web-shared';
import { LiveMap, type LiveRider } from '@/components/LiveMap';
import { AssignRiderModal } from '@/components/AssignRiderModal';

interface LiveData {
  orders: Order[];
  riders: LiveRider[];
}

const ACTIVE = ['PLACED', 'ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'];

export default function LivePage() {
  const router = useRouter();
  const { data, error, loading, reload, setData } = useApi<LiveData>('/admin/live');
  const [assigning, setAssigning] = useState<Order | null>(null);
  const [tab, setTab] = useState<'waiting' | 'all' | 'riders'>('waiting');

  useInterval(() => void reload(), 20_000);

  useSocketEvent<{ riderId: string; lat: number; lng: number; activeOrderId: string | null; at: string }>('rider:location', (p) => {
    setData((prev) => {
      if (!prev) return prev as unknown as LiveData;
      const known = prev.riders.some((r) => r.id === p.riderId);
      if (!known) return prev;
      return {
        ...prev,
        riders: prev.riders.map((r) =>
          r.id === p.riderId ? { ...r, lat: p.lat, lng: p.lng, activeOrderId: p.activeOrderId, isStale: false, locationUpdatedAt: p.at } : r,
        ),
      };
    });
  });

  const upsertOrder = useCallback(
    (order: Order) =>
      setData((prev) => {
        if (!prev) return prev as unknown as LiveData;
        const others = prev.orders.filter((o) => o.id !== order.id);
        return { ...prev, orders: ACTIVE.includes(order.status) ? [...others, order] : others };
      }),
    [setData],
  );
  useSocketEvent<Order>('order:updated', (order) => {
    if (order && 'status' in order && 'pickup' in order) upsertOrder(order);
  });
  useSocketEvent('rider:status', () => void reload());

  if (loading && !data) return <LoadingBlock label="Loading live operations…" />;
  if (error && !data) return <ErrorState message={error.message} onRetry={() => void reload()} />;
  if (!data) return null;

  const waiting = data.orders.filter(
    (o) => !o.rider && ((o.type === 'PARCEL' && o.status === 'PLACED') || o.status === 'ACCEPTED' || o.status === 'READY_FOR_PICKUP'),
  );
  const list = tab === 'waiting' ? waiting : data.orders;

  return (
    <div>
      <PageHeader
        title="Live map"
        subtitle={`${data.orders.length} active orders · ${data.riders.length} riders online · ${waiting.length} waiting for a rider`}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="flex max-h-[calc(100vh-190px)] flex-col p-3">
          <Tabs
            tabs={[
              { value: 'waiting', label: 'Needs rider', count: waiting.length },
              { value: 'all', label: 'All active', count: data.orders.length },
              { value: 'riders', label: 'Riders', count: data.riders.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            {tab === 'riders' ? (
              <ul className="divide-y divide-line">
                {data.riders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-semibold">{r.name ?? r.phone}</p>
                      <p className="text-xs text-muted">
                        {r.vehiclePlate} · updated {timeAgo(r.locationUpdatedAt)}
                      </p>
                    </div>
                    {r.isStale ? <Badge tone="gray">Stale GPS</Badge> : r.activeOrderId ? <Badge tone="dark">Busy</Badge> : <Badge tone="green">Available</Badge>}
                  </li>
                ))}
                {data.riders.length === 0 ? <p className="py-8 text-center text-sm text-muted">No riders online.</p> : null}
              </ul>
            ) : list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{tab === 'waiting' ? 'Every order has a rider 🎉' : 'No active orders.'}</p>
            ) : (
              <ul className="space-y-2">
                {list.map((o) => (
                  <li key={o.id} className="rounded-xl border border-line p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <button type="button" className="font-bold hover:text-brand" onClick={() => router.push(`/orders/${o.id}`)}>
                        {o.code}
                      </button>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      <MapPin className="mr-1 inline h-3 w-3" />
                      {o.vendor?.name ?? 'Parcel'} → {o.dropoff.landmark}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted">{timeAgo(o.timestamps.placedAt ?? o.timestamps.createdAt)}</span>
                      {o.rider ? (
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <Bike className="h-3.5 w-3.5" /> {o.rider.name}
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => setAssigning(o)}>
                          Assign rider
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <div className="h-[calc(100vh-190px)] min-h-[420px] overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <LiveMap orders={data.orders} riders={data.riders} onSelectOrder={(o) => (o.rider ? router.push(`/orders/${o.id}`) : setAssigning(o))} />
        </div>
      </div>
      <AssignRiderModal
        order={assigning}
        onClose={() => setAssigning(null)}
        onAssigned={() => {
          setAssigning(null);
          void reload();
        }}
      />
    </div>
  );
}
