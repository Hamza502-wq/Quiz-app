'use client';

import { useState } from 'react';
import { Bike, Zap } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, LoadingBlock, Modal, api, formatMoney, useApi, useToast, type Order } from '@doorstep/web-shared';

interface Candidate {
  riderId: string;
  name: string | null;
  phone: string;
  distanceKm: number;
  cashOwedCents: number;
  cashLimitCents: number;
  canTakeCash: boolean;
  vehicleType: string;
  ratingAvg: number;
}

/** Manual dispatch: nearest online riders, with cash-limit warnings, plus "offer to nearest". */
export function AssignRiderModal({ order, onClose, onAssigned }: { order: Order | null; onClose: () => void; onAssigned: () => void }) {
  const toast = useToast();
  const candidates = useApi<Candidate[]>(order ? `/admin/orders/${order.id}/candidates` : null);
  const [busy, setBusy] = useState<string | null>(null);

  const assign = async (riderId: string) => {
    if (!order) return;
    setBusy(riderId);
    try {
      await api(`/admin/orders/${order.id}/assign`, { body: { riderId } });
      toast(`Rider assigned to ${order.code}`);
      onAssigned();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not assign', 'error');
    } finally {
      setBusy(null);
    }
  };

  const autoAssign = async () => {
    if (!order) return;
    setBusy('auto');
    try {
      const res = await api<{ offered: boolean; message: string }>(`/admin/orders/${order.id}/auto-assign`, { method: 'POST' });
      toast(res.message, res.offered ? 'success' : 'info');
      if (res.offered) onAssigned();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Auto-assign failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={Boolean(order)} onClose={onClose} title={`Assign rider · ${order?.code ?? ''}`} size="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-3 text-sm">
        <span>
          Pickup: <strong>{order?.pickup.address}</strong>
          {order?.paymentMethod === 'CASH' ? (
            <>
              {' '}
              · Cash to collect <strong>{formatMoney(order.amounts.totalCents)}</strong>
            </>
          ) : null}
        </span>
        <Button size="sm" icon={<Zap className="h-4 w-4" />} loading={busy === 'auto'} onClick={() => void autoAssign()}>
          Offer to nearest rider
        </Button>
      </div>
      {candidates.loading && !candidates.data ? (
        <LoadingBlock label="Finding riders…" />
      ) : candidates.error ? (
        <ErrorState message={candidates.error.message} onRetry={() => void candidates.reload()} />
      ) : !candidates.data || candidates.data.length === 0 ? (
        <EmptyState icon={<Bike className="h-9 w-9" />} title="No idle riders online" message="Riders appear here when they are online, approved and not on a delivery." />
      ) : (
        <ul className="divide-y divide-line">
          {candidates.data.map((c) => (
            <li key={c.riderId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">
                  {c.name ?? c.phone} <span className="text-xs font-normal text-muted">{c.vehicleType.toLowerCase()}</span>
                </p>
                <p className="text-xs text-muted">
                  {c.distanceKm.toFixed(1)} km away · {c.ratingAvg ? `${c.ratingAvg.toFixed(1)} ★` : 'no rating'} · owes {formatMoney(c.cashOwedCents)} of{' '}
                  {formatMoney(c.cashLimitCents)} limit
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!c.canTakeCash ? <Badge tone="red">Cash limit reached</Badge> : null}
                <Button size="sm" variant="dark" loading={busy === c.riderId} disabled={!c.canTakeCash || Boolean(busy)} onClick={() => void assign(c.riderId)}>
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
