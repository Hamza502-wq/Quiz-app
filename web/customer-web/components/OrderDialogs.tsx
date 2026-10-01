'use client';

import { useEffect, useState } from 'react';
import { Button, Field, InlineError, Modal, Select, Textarea, api, useToast } from '@doorstep/web-shared';
import type { CustomerOrder } from '@/lib/types';
import { StarInput } from './StoreVisuals';

/** Rate the store and/or the rider after delivery. */
export function RateOrderModal({
  order,
  open,
  onClose,
  onRated,
}: {
  order: CustomerOrder;
  open: boolean;
  onClose: () => void;
  onRated: () => void;
}) {
  const toast = useToast();
  const already = new Set((order.ratings ?? []).map((r) => r.target));
  const rateVendor = order.type === 'DELIVERY' && order.vendor !== null && !already.has('VENDOR');
  const rateRider = order.rider !== null && !already.has('RIDER');
  const [vendorScore, setVendorScore] = useState(0);
  const [vendorComment, setVendorComment] = useState('');
  const [riderScore, setRiderScore] = useState(0);
  const [riderComment, setRiderComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVendorScore(0);
      setVendorComment('');
      setRiderScore(0);
      setRiderComment('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!vendorScore && !riderScore) {
      setError('Tap the stars to give at least one rating.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/orders/${order.id}/rate`, {
        body: {
          ...(rateVendor && vendorScore ? { vendorScore, vendorComment: vendorComment.trim() || undefined } : {}),
          ...(rateRider && riderScore ? { riderScore, riderComment: riderComment.trim() || undefined } : {}),
        },
      });
      toast('Thanks for your feedback!');
      onRated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How was your order?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Later
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {rateVendor ? (
          <div className="space-y-2">
            <p className="font-semibold">{order.vendor?.name}</p>
            <StarInput value={vendorScore} onChange={setVendorScore} label="Rate the store" />
            <Textarea placeholder="What did you think of the food and packaging? (optional)" maxLength={500} value={vendorComment} onChange={(e) => setVendorComment(e.target.value)} />
          </div>
        ) : null}
        {rateRider ? (
          <div className="space-y-2">
            <p className="font-semibold">Your rider{order.rider?.name ? `, ${order.rider.name}` : ''}</p>
            <StarInput value={riderScore} onChange={setRiderScore} label="Rate the rider" />
            <Textarea placeholder="Anything about the delivery? (optional)" maxLength={500} value={riderComment} onChange={(e) => setRiderComment(e.target.value)} />
          </div>
        ) : null}
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

const DISPUTE_REASONS: Array<[string, string]> = [
  ['MISSING_ITEMS', 'Items were missing'],
  ['WRONG_ORDER', 'I got the wrong order'],
  ['DAMAGED', 'Items were damaged or spilled'],
  ['LATE', 'It arrived very late'],
  ['NOT_DELIVERED', 'It was never delivered'],
  ['OVERCHARGED', 'I was overcharged'],
  ['RIDER_CONDUCT', 'Problem with the rider'],
  ['OTHER', 'Something else'],
];

/** Report a problem; DoorStep support reviews it and can refund. */
export function DisputeModal({ orderId, open, onClose, onReported }: { orderId: string; open: boolean; onClose: () => void; onReported: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('MISSING_ITEMS');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('MISSING_ITEMS');
      setDescription('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (description.trim().length < 10) {
      setError('Tell us a little more (at least 10 characters) so support can help.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/orders/${orderId}/dispute`, { body: { reason, description: description.trim() } });
      toast('Thanks — our support team will look into it.');
      onReported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report a problem"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What went wrong?">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {DISPUTE_REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Details" hint="Which items, what happened, and how we can make it right.">
          <Textarea rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

/** Cancel with an optional reason (allowed until the store accepts). */
export function CancelOrderModal({ orderId, open, onClose, onCancelled }: { orderId: string; open: boolean; onClose: () => void; onCancelled: (o: CustomerOrder) => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api<CustomerOrder>(`/orders/${orderId}/cancel`, { body: { reason: reason.trim() || undefined } });
      toast('Your order was cancelled.');
      onCancelled(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this order?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" loading={saving} onClick={() => void submit()}>
            Cancel order
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">If you already paid online, a refund is requested automatically and DoorStep support sends it back to you.</p>
        <Field label="Reason (optional)">
          <Textarea rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
