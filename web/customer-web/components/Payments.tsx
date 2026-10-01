'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ExternalLink, Smartphone, XCircle } from 'lucide-react';
import {
  Button,
  Field,
  InlineError,
  Input,
  Modal,
  Spinner,
  api,
  cn,
  formatMoney,
  useAuth,
  useToast,
  type Currency,
} from '@doorstep/web-shared';
import { ONLINE_PAYMENT_OPTIONS } from '@/lib/payment';
import { looksLikePhone } from '@/lib/format';
import type { PaymentInfo } from '@/lib/types';

type OnlineMethod = 'ECOCASH' | 'ONEMONEY' | 'CARD';
const POLL_MS = 4000;
const POLL_LIMIT_MS = 10 * 60 * 1000;

/**
 * Polls GET /payments/:id while a payment is pending (the API checks Paynow each time).
 * Stops when it settles or after 10 minutes.
 */
export function usePaymentStatus(payment: PaymentInfo | null, onSettled?: (p: PaymentInfo) => void) {
  const [current, setCurrent] = useState<PaymentInfo | null>(payment);
  const [timedOut, setTimedOut] = useState(false);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    setCurrent(payment);
    setTimedOut(false);
  }, [payment]);

  const id = current?.id;
  const pending = current?.status === 'PENDING';
  useEffect(() => {
    if (!id || !pending) return;
    const started = Date.now();
    let stopped = false;
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        clearInterval(timer);
        setTimedOut(true);
        return;
      }
      try {
        const next = await api<PaymentInfo>(`/payments/${id}`);
        if (stopped) return;
        setCurrent(next);
        if (next.status !== 'PENDING') {
          clearInterval(timer);
          settledRef.current?.(next);
        }
      } catch {
        // Network blip: keep polling.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id, pending]);

  return { payment: current, setPayment: setCurrent, timedOut };
}

/** Choose EcoCash / OneMoney / card and the number to charge. */
export function OnlinePaymentForm({
  initialMethod = 'ECOCASH',
  submitLabel,
  onSubmit,
}: {
  initialMethod?: OnlineMethod;
  submitLabel: string;
  onSubmit: (method: OnlineMethod, payerPhone: string | undefined) => Promise<void>;
}) {
  const { user } = useAuth();
  const [method, setMethod] = useState<OnlineMethod>(initialMethod);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = method !== 'CARD';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isMobile && !looksLikePhone(phone)) {
      setError('Enter the mobile-money number to charge, e.g. 0771 234 567.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(method, isMobile ? phone.trim() : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment could not be started');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {ONLINE_PAYMENT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setMethod(o.value)}
            aria-pressed={method === o.value}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold',
              method === o.value ? 'border-brand bg-brand-light/40 ring-2 ring-brand/20' : 'border-line hover:border-brand',
            )}
          >
            <o.icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            {o.label}
          </button>
        ))}
      </div>
      {isMobile ? (
        <Field label="Number to charge">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx xxx xxx" />
        </Field>
      ) : null}
      <InlineError message={error} />
      <Button type="submit" loading={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

/** Live status of one payment: prompt instructions, card link, success or failure. */
export function PaymentStatusView({ payment, timedOut }: { payment: PaymentInfo; timedOut: boolean }) {
  if (payment.status === 'PAID') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-success-light px-3 py-2.5 text-sm font-medium text-success">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Payment received. Thank you!
      </div>
    );
  }
  if (payment.status !== 'PENDING') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-alert-light px-3 py-2.5 text-sm font-medium text-alert">
        <XCircle className="h-5 w-5 shrink-0" aria-hidden /> The payment {payment.status === 'CANCELLED' ? 'was cancelled' : 'failed'}. You can try again below.
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl bg-brand-light/50 p-4 text-sm">
      <div className="flex items-start gap-2">
        {payment.method === 'CARD' ? <Spinner className="mt-0.5 h-4 w-4 shrink-0" /> : <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />}
        <div>
          <p className="font-semibold">
            {payment.method === 'CARD'
              ? 'Waiting for your card payment'
              : `Approve ${formatMoney(payment.amountCents, payment.currency as Currency)} on your phone`}
          </p>
          <p className="mt-0.5 text-ink-soft">
            {payment.instructions ??
              (payment.method === 'CARD'
                ? 'Open the secure Paynow page to pay. This page updates by itself once the payment goes through.'
                : 'Enter your PIN in the prompt we sent. This page updates by itself once the payment goes through.')}
          </p>
        </div>
      </div>
      {payment.method === 'CARD' && payment.redirectUrl ? (
        <a
          href={payment.redirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-dark"
        >
          Pay by card <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      {timedOut ? <p className="text-xs text-warning">Still waiting. If you already paid, refresh the page in a moment.</p> : (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Spinner className="h-3.5 w-3.5" /> Checking with Paynow…
        </p>
      )}
    </div>
  );
}

/** Post-delivery tip for the rider, paid online. */
export function TipModal({ orderId, open, onClose, maxTipCents }: { orderId: string; open: boolean; onClose: () => void; maxTipCents?: number }) {
  const toast = useToast();
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState('');
  const [started, setStarted] = useState<PaymentInfo | null>(null);
  const { payment, timedOut } = usePaymentStatus(started, (p) => {
    if (p.status === 'PAID') toast('Thank you! Your tip was sent to the rider.');
  });

  useEffect(() => {
    if (open) {
      setStarted(null);
      setAmount(100);
      setCustom('');
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Tip your rider" size="sm">
      {payment ? (
        <div className="space-y-3">
          <PaymentStatusView payment={payment} timedOut={timedOut} />
          {payment.status !== 'PENDING' ? (
            <Button variant="secondary" className="w-full" onClick={payment.status === 'PAID' ? onClose : () => setStarted(null)}>
              {payment.status === 'PAID' ? 'Done' : 'Try again'}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {[50, 100, 200, 500].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setAmount(c);
                  setCustom('');
                }}
                aria-pressed={amount === c && !custom}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-semibold',
                  amount === c && !custom ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand',
                )}
              >
                {formatMoney(c)}
              </button>
            ))}
            <Input
              inputMode="decimal"
              placeholder="Other (US$)"
              value={custom}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '');
                setCustom(v);
                const cents = Math.round(parseFloat(v) * 100);
                setAmount(Number.isFinite(cents) ? cents : 0);
              }}
              className="w-28 py-1.5"
              aria-label="Custom tip in US dollars"
            />
          </div>
          <OnlinePaymentForm
            submitLabel={`Send ${formatMoney(Math.max(amount, 0))} tip`}
            onSubmit={async (method, payerPhone) => {
              if (amount < 50) throw new Error('The minimum tip is US$0.50.');
              if (maxTipCents !== undefined && amount > maxTipCents) throw new Error(`Tips are limited to ${formatMoney(maxTipCents)}.`);
              setStarted(await api<PaymentInfo>(`/orders/${orderId}/tip`, { body: { amountCents: amount, method, payerPhone } }));
            }}
          />
        </div>
      )}
    </Modal>
  );
}
