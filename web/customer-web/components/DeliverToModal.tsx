'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Crosshair, Home, MapPin } from 'lucide-react';
import {
  Button,
  Field,
  InlineError,
  Input,
  MapPicker,
  Modal,
  Spinner,
  cn,
  config,
  useApi,
  useAuth,
  type LatLng,
} from '@doorstep/web-shared';
import { MAP_UNAVAILABLE_MESSAGE, currentPosition, useDeliverTo } from '@/lib/location';
import { addressSummary } from '@/lib/format';
import type { Address } from '@/lib/types';

/** Choose where to deliver: a saved address, the browser's location, or a pin on the map. */
export function DeliverToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { deliverTo, setDeliverTo } = useDeliverTo();
  const addresses = useApi<Address[]>(open && user ? '/customer/addresses' : null);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [pin, setPin] = useState<LatLng | null>(null);
  const [label, setLabel] = useState('Pinned location');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('list');
      setError(null);
      setPin(deliverTo ? { lat: deliverTo.lat, lng: deliverTo.lng } : null);
    }
  }, [open, deliverTo]);

  const locateMe = async () => {
    setLocating(true);
    setError(null);
    try {
      const p = await currentPosition();
      setDeliverTo({ ...p, label: 'Current location', addressId: null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location');
    } finally {
      setLocating(false);
    }
  };

  const savePin = () => {
    const p = pin ?? config.defaultCenter;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      setError('Pick a valid spot on the map.');
      return;
    }
    setDeliverTo({ lat: p.lat, lng: p.lng, label: label.trim() || 'Pinned location', addressId: null });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Where should we deliver?"
      footer={
        mode === 'map' ? (
          <>
            <Button variant="secondary" onClick={() => setMode('list')}>
              Back
            </Button>
            <Button onClick={savePin}>Deliver here</Button>
          </>
        ) : undefined
      }
    >
      {mode === 'list' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">We use this to show stores that deliver to you, with delivery fees and times.</p>
          <button
            type="button"
            onClick={() => void locateMe()}
            disabled={locating}
            className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-brand disabled:opacity-60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
              {locating ? <Spinner /> : <Crosshair className="h-5 w-5" />}
            </span>
            <span>
              <span className="block font-semibold">Use my current location</span>
              <span className="block text-xs text-muted">Your browser will ask for permission</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode('map')}
            className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-brand"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-alert-light text-alert">
              <MapPin className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold">Drop a pin on the map</span>
              <span className="block text-xs text-muted">Good when GPS is off or you are ordering for someone else</span>
            </span>
          </button>

          <InlineError message={error} />

          {user ? (
            <div className="pt-2">
              <p className="mb-2 text-sm font-semibold">Saved addresses</p>
              {addresses.loading && !addresses.data ? (
                <Spinner />
              ) : addresses.error ? (
                <InlineError message={addresses.error.message} />
              ) : addresses.data && addresses.data.length > 0 ? (
                <ul className="space-y-2">
                  {addresses.data.map((a) => {
                    const selected = deliverTo?.addressId === a.id;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setDeliverTo({ lat: a.lat, lng: a.lng, label: a.label, addressId: a.id });
                            onClose();
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-xl border p-3 text-left',
                            selected ? 'border-brand bg-brand-light/40' : 'border-line hover:border-brand',
                          )}
                        >
                          <Home className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">
                              {a.label}
                              {a.isDefault ? <span className="ml-2 text-xs font-medium text-muted">Default</span> : null}
                            </span>
                            <span className="block truncate text-xs text-muted">{addressSummary(a) || a.landmark}</span>
                          </span>
                          {selected ? <Check className="h-4 w-4 text-brand" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No saved addresses yet. You can add one at checkout or in{' '}
                  <Link href="/account" className="font-semibold text-brand hover:underline" onClick={onClose}>
                    your account
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : (
            <p className="pt-2 text-sm text-muted">
              <Link href="/login" className="font-semibold text-brand hover:underline" onClick={onClose}>
                Sign in
              </Link>{' '}
              to use your saved addresses.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <MapPicker value={pin} onChange={setPin} height={300} unavailableMessage={MAP_UNAVAILABLE_MESSAGE} />
          <Field label="Name this spot" hint="e.g. Office, Mum's house">
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <InlineError message={error} />
        </div>
      )}
    </Modal>
  );
}
