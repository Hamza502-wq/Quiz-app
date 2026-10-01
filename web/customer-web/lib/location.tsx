'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'ds_web_deliver_to';

/** Where the customer wants delivery: a saved address or a pinned/current location. */
export interface DeliverTo {
  lat: number;
  lng: number;
  label: string;
  /** Set when this is one of the customer's saved addresses. */
  addressId: string | null;
}

interface LocationContextValue {
  deliverTo: DeliverTo | null;
  ready: boolean;
  setDeliverTo: (value: DeliverTo | null) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

function isValid(v: unknown): v is DeliverTo {
  if (!v || typeof v !== 'object') return false;
  const d = v as DeliverTo;
  return Number.isFinite(d.lat) && Number.isFinite(d.lng) && typeof d.label === 'string' && Math.abs(d.lat) <= 90 && Math.abs(d.lng) <= 180;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [deliverTo, setState] = useState<DeliverTo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readJson<unknown>(STORAGE_KEY);
    if (isValid(saved)) setState({ ...saved, addressId: saved.addressId ?? null });
    setReady(true);
  }, []);

  const setDeliverTo = useCallback((value: DeliverTo | null) => {
    setState(value);
    writeJson(STORAGE_KEY, value);
  }, []);

  const value = useMemo(() => ({ deliverTo, ready, setDeliverTo }), [deliverTo, ready, setDeliverTo]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useDeliverTo(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useDeliverTo must be used inside <LocationProvider>');
  return ctx;
}

/** Browser geolocation as a promise with a friendly error message. */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Your browser cannot share its location. Pick the spot on the map instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. Allow it in your browser, or pick the spot on the map.'
              : 'We could not get your location. Try again or pick the spot on the map.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

/** Shown instead of the map picker when Google Maps isn't configured. */
export const MAP_UNAVAILABLE_MESSAGE =
  "The map isn't available right now. Tap “Use my location”, or enter the coordinates from your phone's map app.";
