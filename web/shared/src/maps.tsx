'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { APIProvider, AdvancedMarker, Map, Pin, useMap } from '@vis.gl/react-google-maps';
import { LocateFixed, MapPin, MapPinned, Search } from 'lucide-react';
import { config } from './config';
import { Button, Input } from './ui';

export interface LatLng {
  lat: number;
  lng: number;
}

export const mapsEnabled = Boolean(config.mapsApiKey);

/** Loads the Google Maps JS API once for its children. */
export function MapsProvider({ children }: { children: ReactNode }) {
  if (!mapsEnabled) return <>{children}</>;
  return <APIProvider apiKey={config.mapsApiKey}>{children}</APIProvider>;
}

export function MapNotConfigured({ className, message }: { className?: string; message?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-canvas p-6 text-center text-sm text-muted ${className ?? ''}`}>
      <MapPinned className="h-8 w-8 text-brand" aria-hidden />
      {message ? (
        <p>{message}</p>
      ) : process.env.NODE_ENV === 'production' ? (
        <p>The map isn&apos;t available right now.</p>
      ) : (
        <p>
          Maps are disabled. Set <code className="rounded bg-white px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable Google Maps.
        </p>
      )}
    </div>
  );
}

/** Brand-coloured map pin. `tone`: orange = store/rider, red = customer/drop-off. */
export function BrandPin({ tone = 'orange', glyph }: { tone?: 'orange' | 'red' | 'dark' | 'green'; glyph?: string }) {
  const colors = {
    orange: ['#FF7A00', '#C85F00'],
    red: ['#E01E1E', '#A51616'],
    dark: ['#1A1A1A', '#000000'],
    green: ['#319B42', '#23702F'],
  }[tone];
  return <Pin background={colors[0]} borderColor={colors[1]} glyphColor="#FFFFFF" glyph={glyph} />;
}

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.panTo(center);
      map.setZoom(16);
    }
  }, [map, center]);
  return null;
}

interface Place extends LatLng {
  label: string;
}

/** Street-level name for a point, e.g. "Samora Machel Avenue, Harare" (OpenStreetMap). */
async function placeName(point: LatLng, signal?: AbortSignal): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=0&lat=${point.lat}&lon=${point.lng}`;
  const res = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ? shortPlace(data.display_name) : null;
}

/** Places in Zimbabwe matching a search, best first (OpenStreetMap). */
async function searchPlaces(query: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=zw&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Search is not available right now');
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  return data.map((d) => ({ lat: Number(d.lat), lng: Number(d.lon), label: shortPlace(d.display_name) }));
}

/** Drops the country and postcode from long OpenStreetMap names. */
function shortPlace(name: string): string {
  return name
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'Zimbabwe' && !/^\d+$/.test(p))
    .slice(0, 4)
    .join(', ');
}

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.7 1 16c0 11.2 15 25 15 25s15-13.8 15-25C31 7.7 24.3 1 16 1z" fill="#E01E1E" stroke="#A51616" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>';

/** OpenStreetMap map (no key needed): tap to place the pin, or drag it. */
function OsmMap({ value, recenterTo, onPick, height }: { value: LatLng | null; recenterTo: LatLng | null; onPick: (p: LatLng) => void; height: number }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const marker = useRef<import('leaflet').Marker | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const latest = useRef({ value, onPick });
  useEffect(() => {
    latest.current = { value, onPick };
  });

  const placeMarker = useCallback((point: LatLng) => {
    const L = leaflet.current;
    if (!L || !map.current) return;
    if (marker.current) {
      marker.current.setLatLng([point.lat, point.lng]);
      return;
    }
    const icon = L.divIcon({ html: PIN_SVG, className: 'ds-map-pin', iconSize: [32, 42], iconAnchor: [16, 41] });
    const m = L.marker([point.lat, point.lng], { draggable: true, icon, title: 'Chosen location', alt: 'Chosen location' }).addTo(map.current);
    m.on('dragend', () => {
      const p = m.getLatLng();
      latest.current.onPick({ lat: p.lat, lng: p.lng });
    });
    marker.current = m;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    void import('leaflet').then((L) => {
      if (cancelled || !container.current) return;
      leaflet.current = L;
      const start = latest.current.value ?? config.defaultCenter;
      const m = L.map(container.current, { center: [start.lat, start.lng], zoom: latest.current.value ? 16 : 13 });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      m.on('click', (e) => {
        placeMarker({ lat: e.latlng.lat, lng: e.latlng.lng });
        latest.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      map.current = m;
      if (latest.current.value) placeMarker(latest.current.value);
      // Maps inside dialogs open before their final size is known.
      observer = new ResizeObserver(() => m.invalidateSize());
      observer.observe(container.current);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [placeMarker]);

  // Follow the chosen point (search result, "use my location", or a parent update).
  useEffect(() => {
    if (value) placeMarker(value);
  }, [value, placeMarker]);
  useEffect(() => {
    // No zoom animation: a form that closes mid-animation would otherwise crash Leaflet.
    if (recenterTo) map.current?.setView([recenterTo.lat, recenterTo.lng], 16, { animate: false });
  }, [recenterTo]);

  return <div ref={container} className="ds-osm-map h-full w-full" style={{ height }} role="application" aria-label="Map: tap to choose the location" />;
}

/**
 * Choose a location on a map: search for a place, tap the map, drag the pin or use the
 * device's location. Shows Google Maps when a key is configured, otherwise OpenStreetMap.
 * The chosen spot is described by its street name, never as coordinates.
 */
export function MapPicker({ value, onChange, height = 320 }: { value: LatLng | null; onChange: (value: LatLng) => void; height?: number }) {
  const [recenterTo, setRecenterTo] = useState<LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  // Describe the pinned spot by name (best effort; the pin is what counts).
  const lat = value?.lat;
  const lng = value?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      placeName({ lat, lng }, controller.signal)
        .then((name) => setLabel(name))
        .catch(() => undefined);
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lat, lng]);

  const choose = (point: LatLng, name?: string) => {
    onChange(point);
    setRecenterTo(point);
    setLabel(name ?? null);
  };

  const pick = (point: LatLng) => {
    setLabel(null);
    onChange(point);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setMessage("This device can't share its location. Search for the place or tap the map instead.");
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        choose({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setMessage('Location is turned off. Allow location for this site, or search for the place.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setMessage('Type at least 3 letters of a street, suburb or place.');
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const found = await searchPlaces(q);
      setResults(found);
      if (found.length === 0) setMessage('Nothing found. Try a nearby landmark or suburb, or tap the map.');
    } catch {
      setMessage('Search is not available right now. Tap the map or use your location.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResults(null);
              }}
              onKeyDown={(e) => {
                // Search here instead of submitting the surrounding form.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search();
                }
              }}
              placeholder="Search a street, suburb or landmark"
              aria-label="Search for a place"
              className="pl-9"
            />
          </div>
          <Button type="button" variant="secondary" loading={searching} onClick={() => void search()}>
            Search
          </Button>
        </div>
        {results && results.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-[1000] mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-card" role="listbox" aria-label="Places found">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
                  onClick={() => {
                    choose({ lat: r.lat, lng: r.lng }, r.label);
                    setResults(null);
                    setQuery(r.label);
                  }}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="relative z-0 overflow-hidden rounded-2xl border border-line" style={{ height }}>
        {mapsEnabled ? (
          <Map
            defaultCenter={value ?? config.defaultCenter}
            defaultZoom={value ? 16 : 13}
            mapId={config.mapId}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl
            onClick={(e) => {
              const ll = e.detail.latLng;
              if (ll) pick({ lat: ll.lat, lng: ll.lng });
            }}
          >
            {value ? (
              <AdvancedMarker
                position={value}
                draggable
                onDragEnd={(e) => {
                  const ll = e.latLng;
                  if (ll) pick({ lat: ll.lat(), lng: ll.lng() });
                }}
              >
                <BrandPin tone="red" />
              </AdvancedMarker>
            ) : null}
            {recenterTo ? <Recenter center={recenterTo} /> : null}
          </Map>
        ) : (
          <OsmMap value={value} recenterTo={recenterTo} onPick={pick} height={height} />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="flex min-w-0 items-center gap-1 text-muted" aria-live="polite">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-alert" aria-hidden />
          {value ? (
            <span className="truncate">
              <span className="font-semibold text-ink">Pin placed</span>
              {label ? ` · ${label}` : ' · drag the pin to adjust'}
            </span>
          ) : (
            <span>Tap the map where the pin should go, or search above.</span>
          )}
        </p>
        <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-60" onClick={useMyLocation} disabled={locating}>
          <LocateFixed className="h-3.5 w-3.5" aria-hidden /> {locating ? 'Finding you…' : 'Use my location'}
        </button>
      </div>
      {message ? <p className="text-xs text-alert">{message}</p> : null}
    </div>
  );
}
