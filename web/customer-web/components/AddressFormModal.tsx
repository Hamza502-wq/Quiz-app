'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Field,
  InlineError,
  Input,
  MapPicker,
  Modal,
  Textarea,
  api,
  cn,
  type LatLng,
} from '@doorstep/web-shared';
import { MAP_UNAVAILABLE_MESSAGE, useDeliverTo } from '@/lib/location';
import type { Address } from '@/lib/types';

const QUICK_LABELS = ['Home', 'Work', 'Other'];

/** Create or edit a saved address: map pin plus the landmark directions riders rely on. */
export function AddressFormModal({
  open,
  onClose,
  onSaved,
  address,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (address: Address) => void;
  /** Edit this address; omit to create a new one. */
  address?: Address | null;
}) {
  const { deliverTo } = useDeliverTo();
  const [label, setLabel] = useState('Home');
  const [pin, setPin] = useState<LatLng | null>(null);
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('Harare');
  const [landmark, setLandmark] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLabel(address?.label ?? 'Home');
    setPin(address ? { lat: address.lat, lng: address.lng } : deliverTo ? { lat: deliverTo.lat, lng: deliverTo.lng } : null);
    setStreet(address?.street ?? '');
    setSuburb(address?.suburb ?? '');
    setCity(address?.city ?? 'Harare');
    setLandmark(address?.landmark ?? '');
    setMakeDefault(address?.isDefault ?? false);
  }, [open, address, deliverTo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) {
      setError('Drop the pin on your gate or door.');
      return;
    }
    if (landmark.trim().length < 3) {
      setError('Add directions a rider can follow, e.g. “blue gate opposite Spar”.');
      return;
    }
    if (city.trim().length < 2) {
      setError('Enter your town or city.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        label: label.trim() || 'Home',
        lat: pin.lat,
        lng: pin.lng,
        street: street.trim() || undefined,
        suburb: suburb.trim() || undefined,
        city: city.trim(),
        landmark: landmark.trim(),
        makeDefault,
      };
      const saved = address
        ? await api<Address>(`/customer/addresses/${address.id}`, { method: 'PATCH', body })
        : await api<Address>('/customer/addresses', { body });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={address ? 'Edit address' : 'Add a delivery address'} size="lg">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium">Pin your exact spot</p>
          <MapPicker value={pin} onChange={setPin} height={280} unavailableMessage={MAP_UNAVAILABLE_MESSAGE} />
        </div>
        <Field label="Directions for the rider" hint="Landmarks matter more than street names, e.g. “house 12, blue gate opposite Spar”.">
          <Textarea value={landmark} maxLength={200} rows={2} required onChange={(e) => setLandmark(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Street (optional)">
            <Input value={street} maxLength={120} onChange={(e) => setStreet(e.target.value)} />
          </Field>
          <Field label="Suburb (optional)">
            <Input value={suburb} maxLength={80} onChange={(e) => setSuburb(e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={city} maxLength={60} required onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Label</p>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_LABELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLabel(l)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-semibold',
                  label === l ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand',
                )}
              >
                {l}
              </button>
            ))}
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="w-40 py-1.5" aria-label="Custom label" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 accent-[#FF7A00]" />
          Make this my default address
        </label>
        <InlineError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save address
          </Button>
        </div>
      </form>
    </Modal>
  );
}
