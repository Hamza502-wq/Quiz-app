'use client';

import { useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  Field,
  InlineError,
  Input,
  MapPicker,
  Select,
  Textarea,
  centsToInput,
  parseMoneyToCents,
  useApi,
  type LatLng,
  type PayoutMethod,
  type VendorProfile,
} from '@doorstep/web-shared';
import { ImageUpload } from './ImageUpload';

export interface StoreFormValues {
  name: string;
  description?: string;
  phone: string;
  email?: string;
  /** Any shop category from GET /categories (food, groceries, electronics, fashion, …). */
  categorySlug: string;
  lat: number;
  lng: number;
  addressLine: string;
  landmark?: string;
  city: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  avgPrepMinutes: number;
  minOrderCents: number;
  payoutMethod?: PayoutMethod;
  payoutAccount?: string;
  payoutAccountName?: string;
  payoutBankName?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

/** Store details form used for onboarding and profile editing. */
export function StoreForm({
  initial,
  submitLabel,
  onSubmit,
  defaultPhone,
}: {
  initial?: VendorProfile;
  submitLabel: string;
  onSubmit: (values: StoreFormValues) => Promise<void>;
  defaultPhone?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? defaultPhone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [category, setCategory] = useState(initial?.category?.slug ?? '');
  const categories = useApi<Category[]>('/categories');
  // "Parcels" is the send-a-parcel service, not a kind of shop.
  const shopCategories = (categories.data ?? []).filter((c) => c.slug !== 'parcels');
  const [location, setLocation] = useState<LatLng | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [city, setCity] = useState(initial?.city ?? 'Harare');
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logoUrl ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null);
  const [prep, setPrep] = useState(String(initial?.avgPrepMinutes ?? 20));
  const [minOrder, setMinOrder] = useState(centsToInput(initial?.minOrderCents ?? 0));
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod | ''>(initial?.payoutMethod ?? '');
  const [payoutAccount, setPayoutAccount] = useState(initial?.payoutAccount ?? '');
  const [payoutAccountName, setPayoutAccountName] = useState(initial?.payoutAccountName ?? '');
  const [payoutBankName, setPayoutBankName] = useState(initial?.payoutBankName ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!category) return setError('Choose the kind of shop you run.');
    if (!logoUrl) return setError('Add your shop logo or a photo of your shop front. Customers see it next to your name.');
    if (!location) return setError('Drop a pin on the map to set your store location.');
    const prepMinutes = Number(prep);
    if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 180) return setError('The time to get an order ready must be 1–180 minutes.');
    const minOrderCents = parseMoneyToCents(minOrder || '0');
    if (minOrderCents === null) return setError('Enter a valid minimum order amount.');
    if (payoutMethod === 'BANK' && !payoutBankName.trim()) return setError('Enter your bank name for bank payouts.');

    setPending(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        phone: phone.trim(),
        email: email.trim() || undefined,
        categorySlug: category,
        lat: location.lat,
        lng: location.lng,
        addressLine: addressLine.trim(),
        landmark: landmark.trim() || undefined,
        city: city.trim(),
        logoUrl,
        coverUrl,
        avgPrepMinutes: prepMinutes,
        minOrderCents,
        payoutMethod: payoutMethod || undefined,
        payoutAccount: payoutAccount.trim() || undefined,
        payoutAccountName: payoutAccountName.trim() || undefined,
        payoutBankName: payoutMethod === 'BANK' ? payoutBankName.trim() || undefined : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Store details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name">
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sadza Republic or Avondale Hardware" />
          </Field>
          <Field label="What do you sell?" hint="Restaurants and every other kind of shop are welcome">
            <Select required value={category} onChange={(e) => setCategory(e.target.value)} disabled={!categories.data && !categories.error}>
              <option value="">{categories.data || categories.error ? 'Choose a category…' : 'Loading categories…'}</option>
              {shopCategories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
            {categories.error ? (
              <button type="button" className="mt-1 text-xs font-semibold text-brand hover:underline" onClick={() => void categories.reload()}>
                Couldn&apos;t load categories. Try again
              </button>
            ) : null}
          </Field>
          <Field label="Store phone" hint="Customers and riders call this number">
            <Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0771 234 567" />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <Field label="Description (optional)">
          <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you sell, and what makes your shop special?" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUpload label="Logo or shop photo (required)" kind="vendor" value={logoUrl} required onChange={(url) => setLogoUrl(url)} />
          <ImageUpload label="Cover photo (optional)" kind="vendor" aspect="wide" value={coverUrl} onChange={(url) => setCoverUrl(url)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Average time to get an order ready (minutes)">
            <Input type="number" min={1} max={180} required value={prep} onChange={(e) => setPrep(e.target.value)} />
          </Field>
          <Field label="Minimum order (US$)" hint="0 for no minimum">
            <Input inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Location</h2>
        <MapPicker value={location} onChange={setLocation} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Street address">
            <Input required maxLength={160} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="45 Samora Machel Ave" />
          </Field>
          <Field label="City">
            <Input required value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <Field label="Landmark / directions for riders" hint='e.g. "Next to the green pharmacy, opposite the bus stop"'>
          <Input maxLength={200} value={landmark} onChange={(e) => setLandmark(e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Payout details</h2>
        <p className="text-sm text-muted">Where DoorStep sends your earnings (sales minus commission).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payout method">
            <Select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod | '')}>
              <option value="">Choose…</option>
              <option value="ECOCASH">EcoCash</option>
              <option value="ONEMONEY">OneMoney</option>
              <option value="BANK">Bank transfer</option>
            </Select>
          </Field>
          <Field label={payoutMethod === 'BANK' ? 'Account number' : 'Mobile money number'}>
            <Input value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} />
          </Field>
          <Field label="Account name">
            <Input value={payoutAccountName} onChange={(e) => setPayoutAccountName(e.target.value)} />
          </Field>
          {payoutMethod === 'BANK' ? (
            <Field label="Bank name">
              <Input value={payoutBankName} onChange={(e) => setPayoutBankName(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </Card>

      <InlineError message={error} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
