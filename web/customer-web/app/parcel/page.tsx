'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Package, Plus } from 'lucide-react';
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineError,
  Input,
  MapPicker,
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
  type LatLng,
  type PaymentMethod,
} from '@doorstep/web-shared';
import { MAP_UNAVAILABLE_MESSAGE, useDeliverTo } from '@/lib/location';
import { addressSummary, etaLabel, looksLikePhone } from '@/lib/format';
import { PAYMENT_OPTIONS } from '@/lib/payment';
import { orderHref } from '@/lib/routes';
import type { Address, CheckoutResult, Quote } from '@/lib/types';
import { RequireCustomer } from '@/components/RequireCustomer';
import { AddressFormModal } from '@/components/AddressFormModal';

type Size = 'SMALL' | 'MEDIUM' | 'LARGE';
const SIZES: Array<{ value: Size; label: string; hint: string }> = [
  { value: 'SMALL', label: 'Small', hint: 'Documents, phone, keys' },
  { value: 'MEDIUM', label: 'Medium', hint: 'Shoebox, a bag of shopping' },
  { value: 'LARGE', label: 'Large', hint: 'Fits on a motorbike carrier' },
];

export default function ParcelPage() {
  return (
    <RequireCustomer>
      <SendParcel />
    </RequireCustomer>
  );
}

function SendParcel() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { deliverTo } = useDeliverTo();
  const addresses = useApi<Address[]>('/customer/addresses');

  const [pickupPin, setPickupPin] = useState<LatLng | null>(deliverTo ? { lat: deliverTo.lat, lng: deliverTo.lng } : null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLandmark, setPickupLandmark] = useState('');
  const [contactName, setContactName] = useState(user?.name ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [dropoffId, setDropoffId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [description, setDescription] = useState('');
  const [size, setSize] = useState<Size>('SMALL');
  const [currency, setCurrency] = useState<Currency>(user?.preferredCurrency ?? 'USD');
  const [method, setMethod] = useState<PaymentMethod>('ECOCASH');
  const [payerPhone, setPayerPhone] = useState(user?.phone ?? '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const list = addresses.data;
    if (!list || dropoffId) return;
    setDropoffId((list.find((a) => a.isDefault) ?? list[0])?.id ?? null);
  }, [addresses.data, dropoffId]);

  const isMobileMoney = method === 'ECOCASH' || method === 'ONEMONEY';
  const ready =
    pickupPin !== null &&
    pickupAddress.trim().length > 0 &&
    pickupLandmark.trim().length > 0 &&
    dropoffId !== null &&
    recipientName.trim().length > 0 &&
    looksLikePhone(recipientPhone) &&
    description.trim().length > 0 &&
    (!contactPhone.trim() || looksLikePhone(contactPhone));

  const buildBody = () => ({
    pickup: {
      lat: pickupPin!.lat,
      lng: pickupPin!.lng,
      address: pickupAddress.trim(),
      landmark: pickupLandmark.trim(),
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    },
    addressId: dropoffId!,
    recipientName: recipientName.trim(),
    recipientPhone: recipientPhone.trim(),
    description: description.trim(),
    size,
    tipCents: 0,
    currency,
  });

  // Price the delivery once everything needed is filled in.
  useEffect(() => {
    if (!ready) {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(() => {
      api<Quote>('/orders/parcel/quote', { body: buildBody() })
        .then((q) => {
          if (!cancelled) {
            setQuote(q);
            setQuoteError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setQuote(null);
            setQuoteError(err instanceof Error ? err.message : 'Could not price this delivery');
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // buildBody reads exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pickupPin, pickupAddress, pickupLandmark, contactName, contactPhone, dropoffId, recipientName, recipientPhone, description, size, currency]);

  const submit = async () => {
    if (!ready) {
      setError('Fill in the pickup, drop-off, recipient and parcel details.');
      return;
    }
    if (isMobileMoney && !looksLikePhone(payerPhone)) {
      setError('Enter the mobile-money number to charge, e.g. 0771 234 567.');
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const result = await api<CheckoutResult>('/orders/parcel', {
        body: { ...buildBody(), paymentMethod: method, ...(isMobileMoney ? { payerPhone: payerPhone.trim() } : {}) },
      });
      if (result.paymentError) toast(`Request created, but payment didn't start: ${result.paymentError}`, 'error');
      else toast(method === 'CASH' ? 'Parcel request sent! We are finding a rider.' : 'Complete the payment to confirm your parcel.', method === 'CASH' ? 'success' : 'info');
      router.push(orderHref(result.order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request');
      setPlacing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Send a parcel" subtitle="A DoorStep rider collects it and delivers it across town, usually within the hour." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">1</span> Pickup
            </h2>
            <MapPicker value={pickupPin} onChange={setPickupPin} height={260} unavailableMessage={MAP_UNAVAILABLE_MESSAGE} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pickup address">
                <Input value={pickupAddress} maxLength={160} onChange={(e) => setPickupAddress(e.target.value)} placeholder="e.g. 14 Fife Avenue, Avenues" />
              </Field>
              <Field label="Directions for the rider">
                <Input value={pickupLandmark} maxLength={200} onChange={(e) => setPickupLandmark(e.target.value)} placeholder="e.g. reception, ask for Tendai" />
              </Field>
              <Field label="Contact name (optional)">
                <Input value={contactName} maxLength={80} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field label="Contact phone (optional)" error={contactPhone.trim() && !looksLikePhone(contactPhone) ? 'Check this number' : null}>
                <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">2</span> Drop-off
              </h2>
              <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                Add address
              </Button>
            </div>
            {addresses.error && !addresses.data ? (
              <ErrorState message={addresses.error.message} onRetry={() => void addresses.reload()} />
            ) : !addresses.data ? (
              <Spinner />
            ) : addresses.data.length === 0 ? (
              <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Add the drop-off address: pin it on the map and add directions.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {addresses.data.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setDropoffId(a.id)}
                    aria-pressed={dropoffId === a.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left',
                      dropoffId === a.id ? 'border-brand bg-brand-light/40 ring-2 ring-brand/20' : 'border-line hover:border-brand',
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient name">
                <Input value={recipientName} maxLength={80} onChange={(e) => setRecipientName(e.target.value)} />
              </Field>
              <Field label="Recipient phone" error={recipientPhone.trim() && !looksLikePhone(recipientPhone) ? 'Check this number' : null}>
                <Input type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="07xx xxx xxx" />
              </Field>
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">3</span> Parcel
            </h2>
            <Field label="What are we delivering?">
              <Textarea rows={2} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. A sealed envelope with documents" />
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSize(s.value)}
                  aria-pressed={size === s.value}
                  className={cn(
                    'rounded-xl border p-3 text-left',
                    size === s.value ? 'border-brand bg-brand-light/40 ring-2 ring-brand/20' : 'border-line hover:border-brand',
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Package className="h-4 w-4 text-brand" aria-hidden /> {s.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{s.hint}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">4</span> Payment
            </h2>
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
                    <span className="block text-xs text-muted">{o.value === 'CASH' ? 'Pay the rider in cash' : o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {isMobileMoney ? (
              <Field label="Number to charge">
                <Input type="tel" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} />
              </Field>
            ) : null}
            <div>
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
        </div>

        <aside>
          <Card className="sticky top-20 space-y-3">
            <h2 className="text-lg font-bold">Delivery price</h2>
            {!ready ? (
              <p className="text-sm text-muted">Fill in the pickup, drop-off, recipient and parcel details to see the price.</p>
            ) : quoting && !quote ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Spinner className="h-4 w-4" /> Calculating…
              </div>
            ) : quote ? (
              <div className={cn('space-y-1.5 text-sm', quoting && 'opacity-60')}>
                <div className="flex justify-between">
                  <span className="text-muted">Distance</span>
                  <span>{quote.distanceKm.toFixed(1)} km</span>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                  <span>Total</span>
                  <span>{quote.currency === 'USD' ? formatMoney(quote.totalCents) : formatMoney(quote.totalLocalCents, 'ZWG')}</span>
                </div>
                {quote.currency === 'ZWG' ? <p className="text-xs text-muted">≈ {formatMoney(quote.totalCents)}</p> : null}
                <p className="text-xs text-muted">Delivered in about {etaLabel(quote.etaMinutes)}</p>
              </div>
            ) : null}
            <InlineError message={quoteError} />
            <InlineError message={error} />
            <Button size="lg" className="w-full" loading={placing} disabled={!quote || quoting} onClick={() => void submit()}>
              {method === 'CASH' ? 'Request pickup' : 'Request pickup & pay'}
            </Button>
          </Card>
        </aside>
      </div>

      <AddressFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(a) => {
          addresses.setData((prev) => [a, ...(prev ?? []).map((x) => (a.isDefault ? { ...x, isDefault: false } : x))]);
          setDropoffId(a.id);
        }}
      />
    </div>
  );
}
