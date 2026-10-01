'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, Plus, ShoppingBag } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  PageHeader,
  Spinner,
  Textarea,
  api,
  cn,
  formatMoney,
  useApi,
  useAuth,
  useToast,
  type Currency,
  type PaymentMethod,
} from '@doorstep/web-shared';
import { PAYMENT_OPTIONS } from '@/lib/payment';
import { orderHref } from '@/lib/routes';
import { useCart } from '@/lib/cart';
import { useDeliverTo } from '@/lib/location';
import { addressSummary, etaLabel, formatIn, looksLikePhone } from '@/lib/format';
import type { Address, CheckoutResult, Quote } from '@/lib/types';
import { RequireCustomer } from '@/components/RequireCustomer';
import { AddressFormModal } from '@/components/AddressFormModal';

export default function CheckoutPage() {
  return (
    <RequireCustomer>
      <Checkout />
    </RequireCustomer>
  );
}

const TIP_PRESETS = [0, 50, 100, 200];

function Checkout() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const cart = useCart();
  const { deliverTo, setDeliverTo } = useDeliverTo();
  const addresses = useApi<Address[]>('/customer/addresses');

  const [addressId, setAddressId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [tipCents, setTipCents] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [currency, setCurrency] = useState<Currency>(user?.preferredCurrency ?? 'USD');
  const [method, setMethod] = useState<PaymentMethod>('ECOCASH');
  const [payerPhone, setPayerPhone] = useState(user?.phone ?? '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  // Preselect: the address chosen in the header, else the default, else the newest.
  useEffect(() => {
    const list = addresses.data;
    if (!list || (addressId && list.some((a) => a.id === addressId))) return;
    const preferred = list.find((a) => a.id === deliverTo?.addressId) ?? list.find((a) => a.isDefault) ?? list[0];
    setAddressId(preferred?.id ?? null);
  }, [addresses.data, addressId, deliverTo?.addressId]);

  const items = useMemo(
    () => cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, ...(l.notes ? { notes: l.notes } : {}) })),
    [cart.lines],
  );

  // Price the cart whenever something that affects the total changes.
  useEffect(() => {
    if (!cart.vendorId || items.length === 0 || !addressId) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(() => {
      api<Quote>('/orders/quote', { body: { vendorId: cart.vendorId, items, tipCents, currency, addressId } })
        .then((q) => {
          if (cancelled) return;
          setQuote(q);
          setQuoteError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setQuote(null);
          setQuoteError(err instanceof Error ? err.message : 'Could not price your order');
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cart.vendorId, items, tipCents, currency, addressId]);

  const isMobileMoney = method === 'ECOCASH' || method === 'ONEMONEY';

  const placeOrder = async () => {
    if (!cart.vendorId || !addressId) return;
    if (isMobileMoney && !looksLikePhone(payerPhone)) {
      setPlaceError('Enter the mobile-money number to charge, e.g. 0771 234 567.');
      return;
    }
    setPlacing(true);
    setPlaceError(null);
    try {
      const result = await api<CheckoutResult>('/orders', {
        body: {
          vendorId: cart.vendorId,
          items,
          tipCents,
          currency,
          addressId,
          paymentMethod: method,
          ...(isMobileMoney ? { payerPhone: payerPhone.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      cart.clear();
      const chosen = addresses.data?.find((a) => a.id === addressId);
      if (chosen) setDeliverTo({ lat: chosen.lat, lng: chosen.lng, label: chosen.label, addressId: chosen.id });
      if (result.paymentError) toast(`Order created, but payment didn't start: ${result.paymentError}`, 'error');
      else if (method === 'CASH') toast('Order placed! The store has been notified.');
      else toast(isMobileMoney ? 'Check your phone to approve the payment.' : 'Complete your card payment to send the order.', 'info');
      router.push(orderHref(result.order.id));
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Could not place your order');
      setPlacing(false);
    }
  };

  if (!cart.ready) return <LoadingBlock />;
  if (cart.lines.length === 0 && !placing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <EmptyState
          icon={<ShoppingBag className="h-9 w-9" aria-hidden />}
          title="Your cart is empty"
          message="Add items from a store, then come back here to check out."
          action={
            <Link href="/" className="font-semibold text-brand hover:underline">
              Browse stores
            </Link>
          }
        />
      </div>
    );
  }

  const fmt = (usd: number) => (quote ? formatIn(usd, quote.currency, quote.exchangeRate) : formatMoney(usd));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Checkout" subtitle={`Ordering from ${cart.vendorName ?? 'your store'}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Delivery address</h2>
              <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                Add new
              </Button>
            </div>
            {addresses.error && !addresses.data ? (
              <ErrorState message={addresses.error.message} onRetry={() => void addresses.reload()} />
            ) : !addresses.data ? (
              <Spinner />
            ) : addresses.data.length === 0 ? (
              <div className="rounded-xl bg-canvas p-4 text-sm">
                <p className="font-semibold">Where should the rider bring your order?</p>
                <p className="mt-1 text-muted">Pin your gate on the map and add directions a rider can follow.</p>
                <Button className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                  Add delivery address
                </Button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {addresses.data.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddressId(a.id)}
                    aria-pressed={addressId === a.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left',
                      addressId === a.id ? 'border-brand bg-brand-light/40 ring-2 ring-brand/20' : 'border-line hover:border-brand',
                    )}
                  >
                    <Home className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold">{a.label}</span>
                      <span className="block text-xs text-muted">{a.landmark}</span>
                      {addressSummary(a) ? <span className="block truncate text-xs text-muted">{addressSummary(a)}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold">Payment</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {PAYMENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setMethod(o.value)}
                  aria-pressed={method === o.value}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left',
                    method === o.value ? 'border-brand bg-brand-light/40 ring-2 ring-brand/20' : 'border-line hover:border-brand',
                  )}
                >
                  <o.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                  <span>
                    <span className="block font-semibold">{o.label}</span>
                    <span className="block text-xs text-muted">{o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {isMobileMoney ? (
              <Field label={`${method === 'ECOCASH' ? 'EcoCash' : 'OneMoney'} number`} className="mt-4" hint="We'll send the payment prompt to this number.">
                <Input type="tel" inputMode="tel" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="07xx xxx xxx" />
              </Field>
            ) : null}
            <div className="mt-4">
              <p className="mb-1.5 text-sm font-medium">Pay in</p>
              <div className="inline-grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
                {(['USD', 'ZWG'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    aria-pressed={currency === c}
                    className={cn('rounded-lg px-4 py-1.5 text-sm font-semibold', currency === c ? 'bg-white text-brand shadow-sm' : 'text-muted')}
                  >
                    {c === 'USD' ? 'US dollars' : 'ZiG'}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-bold">Tip your rider</h2>
            <p className="mb-3 text-sm text-muted">100% of the tip goes to the rider.</p>
            <div className="flex flex-wrap items-center gap-2">
              {TIP_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTipCents(t);
                    setCustomTip('');
                  }}
                  aria-pressed={tipCents === t && !customTip}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-semibold',
                    tipCents === t && !customTip ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand',
                  )}
                >
                  {t === 0 ? 'No tip' : formatMoney(t)}
                </button>
              ))}
              <Input
                inputMode="decimal"
                placeholder="Other (US$)"
                value={customTip}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '');
                  setCustomTip(v);
                  const cents = Math.round(parseFloat(v) * 100);
                  setTipCents(Number.isFinite(cents) && cents > 0 ? Math.min(cents, 100_000) : 0);
                }}
                className="w-32 py-1.5"
                aria-label="Custom tip in US dollars"
              />
            </div>
          </Card>

          <Card>
            <Field label="Note for the store (optional)" hint="Allergies, cutlery, or anything the store should know.">
              <Textarea value={notes} maxLength={300} rows={2} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </Card>
        </div>

        <aside>
          <Card className="sticky top-20 space-y-4">
            <h2 className="text-lg font-bold">Order summary</h2>
            <ul className="space-y-2 text-sm">
              {cart.lines.map((l) => (
                <li key={l.productId} className="flex justify-between gap-3">
                  <span>
                    <span className="font-semibold">{l.quantity}×</span> {l.name}
                    {l.notes ? <span className="block text-xs italic text-muted">“{l.notes}”</span> : null}
                  </span>
                  <span className="shrink-0">{formatMoney(l.priceCents * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <Link href="/cart" className="text-xs font-semibold text-brand hover:underline">
              Edit cart
            </Link>
            <div className="space-y-1.5 border-t border-line pt-3 text-sm">
              {!addressId ? (
                <p className="text-muted">Add a delivery address to see your delivery fee.</p>
              ) : quoting && !quote ? (
                <div className="flex items-center gap-2 text-muted">
                  <Spinner className="h-4 w-4" /> Calculating…
                </div>
              ) : quote ? (
                <>
                  <Row label="Items" value={fmt(quote.subtotalCents)} />
                  <Row label={`Delivery (${quote.distanceKm.toFixed(1)} km)`} value={fmt(quote.deliveryFeeCents)} />
                  {quote.tipCents > 0 ? <Row label="Rider tip" value={fmt(quote.tipCents)} /> : null}
                  <div className={cn('flex justify-between border-t border-line pt-2 text-base font-bold', quoting && 'opacity-60')}>
                    <span>Total</span>
                    <span>{quote.currency === 'USD' ? formatMoney(quote.totalCents) : formatMoney(quote.totalLocalCents, 'ZWG')}</span>
                  </div>
                  {quote.currency === 'ZWG' ? (
                    <p className="text-xs text-muted">
                      ≈ {formatMoney(quote.totalCents)} at {quote.exchangeRate} ZiG per US$
                    </p>
                  ) : null}
                  <p className="text-xs text-muted">Arrives in about {etaLabel(quote.etaMinutes)}</p>
                </>
              ) : null}
              <InlineError message={quoteError} />
            </div>
            <InlineError message={placeError} />
            <Button size="lg" className="w-full" loading={placing} disabled={!quote || quoting || !addressId} onClick={() => void placeOrder()}>
              {method === 'CASH' ? 'Place order' : 'Place order & pay'}
            </Button>
            <p className="text-center text-xs text-muted">You can cancel until the store accepts your order.</p>
          </Card>
        </aside>
      </div>

      <AddressFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(a) => {
          addresses.setData((prev) => [a, ...(prev ?? []).map((x) => (a.isDefault ? { ...x, isDefault: false } : x))]);
          setAddressId(a.id);
        }}
      />
    </div>
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
