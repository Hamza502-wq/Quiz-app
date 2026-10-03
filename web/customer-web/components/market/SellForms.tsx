'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Gavel, ImagePlus, Repeat, Star, Tag, X } from 'lucide-react';
import {
  Button,
  Field,
  InlineError,
  Input,
  MapPicker,
  Select,
  Spinner,
  Textarea,
  Toggle,
  api,
  cn,
  uploadImage,
  useApi,
  useAuth,
  type LatLng,
} from '@doorstep/web-shared';
import { Photo } from '@/components/Photo';
import {
  CONDITION_LABEL,
  centsToDollars,
  dollarsToCents,
  type ListingCondition,
  type ListingDetail,
  type ListingKind,
  type MarketCategory,
  type SaleType,
  type SellerProfile,
} from '@/lib/market';

const MAX_PHOTOS = 8;

// ───────────────────────────── Seller profile ─────────────────────────────

/** The seller's shop name, area and contact preferences. */
export function SellerProfileForm({ initial, onSaved, onCancel }: { initial: SellerProfile | null; onSaved: (s: SellerProfile) => void; onCancel?: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(initial?.displayName ?? user?.name ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [area, setArea] = useState(initial?.area ?? '');
  const [city, setCity] = useState(initial?.city ?? 'Harare');
  const [place, setPlace] = useState<LatLng | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [whatsapp, setWhatsapp] = useState(initial?.whatsappPhone ?? '');
  const [showWhatsapp, setShowWhatsapp] = useState(initial?.showWhatsapp ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) return setError('Enter your shop or display name.');
    if (area.trim().length < 2 || city.trim().length < 2) return setError('Enter your area and town.');
    if (!place) return setError('Choose where you are on the map, so buyers nearby can find you.');
    setSaving(true);
    try {
      const res = await api<{ seller: SellerProfile }>('/market/me/seller', {
        method: 'PUT',
        body: {
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          area: area.trim(),
          city: city.trim(),
          lat: place.lat,
          lng: place.lng,
          whatsappPhone: whatsapp.trim() || null,
          showWhatsapp,
        },
      });
      onSaved(res.seller);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your shop.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Field label="Shop or display name" hint="Shown on your listings, e.g. “Chipo’s Phones” or your own name">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
      </Field>
      <Field label="About you (optional)" hint="What you sell or the services you offer">
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={2} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Area or suburb">
          <Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="e.g. Avondale" required />
        </Field>
        <Field label="Town or city">
          <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="e.g. Harare" required />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Where buyers can find you</p>
        <p className="mb-2 text-xs text-muted">Search for your area or tap the map. Buyers see your area and distance, never your exact spot.</p>
        <MapPicker value={place} onChange={setPlace} height={260} />
      </div>
      <Field label="WhatsApp number (optional)" hint={`Leave empty to use your account number${user?.phone ? ` (${user.phone})` : ''}`}>
        <Input type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={20} placeholder="e.g. 0771 234 567" />
      </Field>
      <Toggle checked={showWhatsapp} onChange={setShowWhatsapp} label="Show a “Chat on WhatsApp” button to signed-in buyers" />
      <InlineError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving}>
          {initial ? 'Save shop details' : 'Open my shop'}
        </Button>
      </div>
    </form>
  );
}

// ───────────────────────────── Photos ─────────────────────────────

const thumbOf = (url: string) => (url.endsWith('-sm.webp') ? url : url.replace(/\.webp$/, '-sm.webp'));

/** Upload, remove and reorder listing photos (the first one is the cover). */
export function PhotoUploader({ photos, onChange }: { photos: string[]; onChange: (photos: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Uploads finish one by one; keep the latest list so none are lost.
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - latest.current.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > chosen.length) setError(`You can add up to ${MAX_PHOTOS} photos.`);
    for (const file of chosen) {
      if (!file.type.startsWith('image/')) {
        setError('Only photos can be added.');
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError('Each photo must be smaller than 8 MB.');
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const res = await uploadImage(file, 'listing');
        latest.current = [...latest.current, res.url];
        onChange(latest.current);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'A photo did not upload.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = '';
  };

  const remove = (url: string) => onChange(photos.filter((p) => p !== url));
  const makeCover = (url: string) => onChange([url, ...photos.filter((p) => p !== url)]);

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((url, i) => (
          <li key={url} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-canvas">
            <Photo src={thumbOf(url)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" fallback={<div className="h-full w-full bg-canvas" />} />
            {i === 0 ? <span className="absolute bottom-1 left-1 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span> : null}
            <div className="absolute right-1 top-1 flex gap-1">
              {i > 0 ? (
                <button type="button" onClick={() => makeCover(url)} className="rounded-full bg-white/90 p-1 text-ink shadow" aria-label={`Make photo ${i + 1} the cover`}>
                  <Star className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button type="button" onClick={() => remove(url)} className="rounded-full bg-white/90 p-1 text-alert shadow" aria-label={`Remove photo ${i + 1}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        {photos.length + uploading < MAX_PHOTOS ? (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs font-semibold text-muted hover:border-brand hover:text-brand"
            >
              {uploading ? <Spinner className="h-5 w-5" /> : photos.length === 0 ? <Camera className="h-6 w-6" aria-hidden /> : <ImagePlus className="h-6 w-6" aria-hidden />}
              {uploading ? 'Uploading…' : 'Add photos'}
            </button>
          </li>
        ) : null}
      </ul>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      <p className="mt-1 text-xs text-muted">Up to {MAX_PHOTOS} photos. Clear photos in daylight sell faster.</p>
      <InlineError message={error} />
    </div>
  );
}

// ───────────────────────────── Listing form ─────────────────────────────

/** "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const QUICK_ENDS = [
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '1 day', ms: 24 * 60 * 60_000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60_000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60_000 },
];

/** Create or edit a listing: an item or a service, at a fixed price or as an auction. */
export function ListingForm({ existing, seller, onSaved, onCancel }: { existing: ListingDetail | null; seller: SellerProfile; onSaved: (l: ListingDetail) => void; onCancel: () => void }) {
  const categories = useApi<MarketCategory[]>('/market/categories');
  const [kind, setKind] = useState<ListingKind>(existing?.kind ?? 'ITEM');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [condition, setCondition] = useState<ListingCondition | ''>(existing?.condition ?? '');
  const [saleType, setSaleType] = useState<SaleType>(existing?.saleType ?? 'FIXED');
  const [price, setPrice] = useState(existing ? centsToDollars(existing.priceCents) : '');
  const [endsAt, setEndsAt] = useState(existing?.auction && !existing.auction.ended ? toLocalInput(new Date(existing.auction.endsAt)) : '');
  const [endsTouched, setEndsTouched] = useState(false);
  const [openToBarter, setOpenToBarter] = useState(existing?.openToBarter ?? false);
  const [photos, setPhotos] = useState<string[]>(existing?.photos.map((p) => p.url) ?? []);
  const [elsewhere, setElsewhere] = useState(Boolean(existing && (existing.area !== seller.area || existing.city !== seller.city)));
  const [place, setPlace] = useState<LatLng | null>(existing ? { lat: existing.lat, lng: existing.lng } : null);
  const [area, setArea] = useState(existing?.area ?? '');
  const [city, setCity] = useState(existing?.city ?? seller.city);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Once people have bid, the price, sale type and end time are fixed.
  const locked = Boolean(existing && existing.saleType === 'AUCTION' && (existing.auction?.bidCount ?? 0) > 0);
  const restarting = Boolean(existing?.auction?.ended && !locked);
  const options = (categories.data ?? []).filter((c) => c.kind === kind);

  const chooseKind = (k: ListingKind) => {
    setKind(k);
    if (category && !(categories.data ?? []).some((c) => c.slug === category && c.kind === k)) setCategory('');
    if (k === 'SERVICE') setSaleType('FIXED');
  };

  const chooseSaleType = (t: SaleType) => {
    setSaleType(t);
    if (t === 'AUCTION') {
      setOpenToBarter(false);
      if (!endsAt) {
        setEndsAt(toLocalInput(new Date(Date.now() + 24 * 60 * 60_000)));
        setEndsTouched(true);
      }
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError('Give your listing a title (at least 3 letters).');
    if (!category) return setError('Choose a category.');
    if (kind === 'ITEM' && !condition) return setError('Say what condition the item is in.');
    if (description.trim().length < 10) return setError('Describe it in a sentence or two (at least 10 letters).');
    const priceCents = dollarsToCents(price);
    if (priceCents === null) return setError('Enter the price in US dollars, e.g. 45 or 12.50.');
    if (saleType === 'AUCTION' && priceCents < 100) return setError('An auction must start at US$1 or more.');
    if (kind === 'ITEM' && photos.length === 0) return setError('Add at least one photo of the item.');
    const sendEnd = saleType === 'AUCTION' && !locked && (endsTouched || !existing || existing.saleType !== 'AUCTION');
    let auctionEndsAt: string | undefined;
    if (sendEnd) {
      const end = endsAt ? new Date(endsAt) : null;
      if (!end || Number.isNaN(end.getTime())) return setError('Choose when the auction ends.');
      if (end.getTime() - Date.now() < 5 * 60_000) return setError('An auction must run for at least 5 minutes.');
      auctionEndsAt = end.toISOString();
    }
    if (restarting && !auctionEndsAt && saleType === 'AUCTION') return setError('Choose a new end time to start the auction again.');
    if (elsewhere) {
      if (!place) return setError('Choose where the item is on the map.');
      if (area.trim().length < 2 || city.trim().length < 2) return setError('Enter the area and town where it is.');
    }

    const body: Record<string, unknown> = {
      kind,
      title: title.trim(),
      description: description.trim(),
      category,
      condition: kind === 'ITEM' ? condition : null,
      openToBarter: saleType === 'FIXED' && openToBarter,
      photos,
    };
    if (!locked) {
      body.priceCents = priceCents;
      body.saleType = saleType;
    }
    if (auctionEndsAt) body.auctionEndsAt = auctionEndsAt;
    if (elsewhere && place) Object.assign(body, { lat: place.lat, lng: place.lng, area: area.trim(), city: city.trim() });
    else if (existing) Object.assign(body, { lat: seller.lat, lng: seller.lng, area: seller.area, city: seller.city });

    setSaving(true);
    try {
      const saved = existing
        ? await api<ListingDetail>(`/market/listings/${existing.id}`, { method: 'PATCH', body })
        : await api<ListingDetail>('/market/listings', { body });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the listing.');
    } finally {
      setSaving(false);
    }
  };

  const segment = (active: boolean) =>
    cn(
      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
      active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-canvas',
    );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-line p-1" role="group" aria-label="What are you listing?">
        <button type="button" className={segment(kind === 'ITEM')} onClick={() => chooseKind('ITEM')} aria-pressed={kind === 'ITEM'}>
          <Tag className="h-4 w-4" aria-hidden /> Something to sell
        </button>
        <button type="button" className={segment(kind === 'SERVICE')} onClick={() => chooseKind('SERVICE')} aria-pressed={kind === 'SERVICE'} disabled={locked}>
          A service I offer
        </button>
      </div>

      <Field label="Photos">
        <PhotoUploader photos={photos} onChange={setPhotos} />
      </Field>

      <Field label="Title" hint={kind === 'ITEM' ? 'e.g. “Samsung A14, 64GB, with charger”' : 'e.g. “Plumber: burst pipes, geysers, toilets”'}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} required>
            <option value="">{categories.data ? 'Choose a category' : 'Loading…'}</option>
            {options.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} · {c.shona}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'ITEM' ? (
          <Field label="Condition">
            <Select value={condition} onChange={(e) => setCondition(e.target.value as ListingCondition | '')} required>
              <option value="">Choose</option>
              {(Object.keys(CONDITION_LABEL) as ListingCondition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} placeholder="Size, model, what's included, any faults, when buyers can collect…" required />
      </Field>

      {kind === 'ITEM' ? (
        <div className="flex gap-1 rounded-xl border border-line p-1" role="group" aria-label="How do you want to sell?">
          <button type="button" className={segment(saleType === 'FIXED')} onClick={() => chooseSaleType('FIXED')} aria-pressed={saleType === 'FIXED'} disabled={locked}>
            <Tag className="h-4 w-4" aria-hidden /> Fixed price
          </button>
          <button type="button" className={segment(saleType === 'AUCTION')} onClick={() => chooseSaleType('AUCTION')} aria-pressed={saleType === 'AUCTION'} disabled={locked}>
            <Gavel className="h-4 w-4" aria-hidden /> Auction
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={saleType === 'AUCTION' ? 'Starting price (US$)' : 'Price (US$)'}
          hint={locked ? 'Fixed now that people have bid' : kind === 'SERVICE' ? 'Enter 0 to ask buyers for a quote' : saleType === 'FIXED' ? 'Enter 0 to give it away free' : 'Bids start here'}
        >
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 45" maxLength={12} disabled={locked} required />
        </Field>
        {saleType === 'AUCTION' ? (
          <Field label="Auction ends" hint={locked ? 'Fixed now that people have bid' : restarting ? 'The auction ended without bids: choose a new end time' : 'Between 5 minutes and 14 days from now'}>
            <Input
              type="datetime-local"
              value={endsAt}
              min={toLocalInput(new Date(Date.now() + 5 * 60_000))}
              onChange={(e) => {
                setEndsAt(e.target.value);
                setEndsTouched(true);
              }}
              disabled={locked}
              required
            />
          </Field>
        ) : null}
      </div>
      {saleType === 'AUCTION' && !locked ? (
        <div className="flex flex-wrap gap-2" aria-label="Quick end times">
          {QUICK_ENDS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                setEndsAt(toLocalInput(new Date(Date.now() + q.ms)));
                setEndsTouched(true);
              }}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-brand hover:text-brand"
            >
              Ends in {q.label}
            </button>
          ))}
        </div>
      ) : null}

      {kind === 'ITEM' && saleType === 'FIXED' ? (
        <div className="flex items-start gap-3 rounded-xl bg-canvas p-3">
          <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div className="flex-1">
            <Toggle checked={openToBarter} onChange={setOpenToBarter} label="Open to swaps" />
            <p className="mt-1 text-xs text-muted">Buyers can offer their own items (and cash) in exchange. You accept, decline or counter.</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-line p-3">
        <Toggle checked={elsewhere} onChange={setElsewhere} label={kind === 'ITEM' ? 'The item is not at my shop' : 'I offer this somewhere else'} />
        {elsewhere ? (
          <div className="mt-3 space-y-3">
            <MapPicker value={place} onChange={setPlace} height={240} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Area or suburb">
                <Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="e.g. Mbare" />
              </Field>
              <Field label="Town or city">
                <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
              </Field>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Listed at your shop: {seller.area}, {seller.city}
          </p>
        )}
      </div>

      <InlineError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {existing ? 'Save changes' : 'Post listing'}
        </Button>
      </div>
    </form>
  );
}
