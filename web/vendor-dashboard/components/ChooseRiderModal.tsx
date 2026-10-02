'use client';

import { useState } from 'react';
import { Bike, RefreshCw, Star } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  PlateBadge,
  api,
  formatMoney,
  useApi,
  useToast,
  vehicleLabel,
  type Order,
} from '@doorstep/web-shared';

interface AvailableRider {
  riderId: string;
  name: string | null;
  photoUrl: string | null;
  vehicleType: string;
  vehiclePlate: string | null;
  ratingAvg: number;
  distanceKm: number;
  zoneName: string | null;
  canTakeCash: boolean;
}

/** The store picks one of the riders who are online, free and nearby to deliver an order. */
export function ChooseRiderModal({ order, onClose, onAssigned }: { order: Order | null; onClose: () => void; onAssigned: (o: Order) => void }) {
  const toast = useToast();
  const riders = useApi<{ radiusKm: number; riders: AvailableRider[] }>(order ? `/vendor/orders/${order.id}/riders` : null);
  const [busy, setBusy] = useState<string | null>(null);

  const assign = async (rider: AvailableRider) => {
    if (!order) return;
    setBusy(rider.riderId);
    try {
      const updated = await api<Order>(`/vendor/orders/${order.id}/assign`, { body: { riderId: rider.riderId } });
      toast(`${rider.name ?? 'The rider'} is delivering ${order.code}`);
      onAssigned(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not assign this rider', 'error');
      void riders.reload();
    } finally {
      setBusy(null);
    }
  };

  const cash = order?.paymentMethod === 'CASH' ? order.amounts.totalCents : 0;

  return (
    <Modal open={Boolean(order)} onClose={onClose} title={`Choose a rider · ${order?.code ?? ''}`} size="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-3 text-sm">
        <span>
          Riders who are online, free and within {riders.data?.radiusKm ?? '…'} km of your store.
          {cash ? (
            <>
              {' '}
              The rider collects <strong>{formatMoney(cash)}</strong> in cash.
            </>
          ) : null}
        </span>
        <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={riders.loading && Boolean(riders.data)} onClick={() => void riders.reload()}>
          Refresh
        </Button>
      </div>
      {riders.loading && !riders.data ? (
        <LoadingBlock label="Finding riders near you…" variant="list" />
      ) : riders.error ? (
        <ErrorState message={riders.error.message} onRetry={() => void riders.reload()} />
      ) : !riders.data || riders.data.riders.length === 0 ? (
        <EmptyState
          icon={<Bike className="h-9 w-9" />}
          title="No free riders nearby right now"
          message="DoorStep keeps looking and sends the order to the next rider who comes online. Refresh to check again."
        />
      ) : (
        <ul className="divide-y divide-line">
          {riders.data.riders.map((r) => (
            <li key={r.riderId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={r.photoUrl} name={r.name ?? 'Rider'} size="md" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.name ?? 'Rider'} <PlateBadge plate={r.vehiclePlate} />
                  </p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    {vehicleLabel(r.vehicleType)} · {r.distanceKm.toFixed(1)} km away
                    {r.ratingAvg > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        · <Star className="h-3 w-3 fill-flag-yellow text-flag-yellow" aria-hidden /> {r.ratingAvg.toFixed(1)}
                      </span>
                    ) : null}
                    {r.zoneName ? <span>· {r.zoneName}</span> : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!r.canTakeCash ? <Badge tone="red">Can&apos;t carry this much cash</Badge> : null}
                <Button size="sm" variant="dark" loading={busy === r.riderId} disabled={!r.canTakeCash || Boolean(busy)} onClick={() => void assign(r)}>
                  Assign
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
