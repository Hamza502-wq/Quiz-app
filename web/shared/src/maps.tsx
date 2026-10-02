'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { APIProvider, AdvancedMarker, Map, Pin, useMap } from '@vis.gl/react-google-maps';
import { MapPinned } from 'lucide-react';
import { config } from './config';
import { Field, Input } from './ui';

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
        <p>The map isn&apos;t available right now. Use your current location or enter the coordinates.</p>
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
    if (map) map.panTo(center);
  }, [map, center]);
  return null;
}

/**
 * Pin-drop location picker: click the map or drag the pin. Falls back to
 * latitude/longitude inputs when Google Maps is not configured
 * (`unavailableMessage` replaces the developer hint on public sites).
 */
export function MapPicker({
  value,
  onChange,
  height = 320,
  unavailableMessage,
}: {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  height?: number;
  unavailableMessage?: string;
}) {
  const [recenterTo, setRecenterTo] = useState<LatLng | null>(null);
  const position = value ?? config.defaultCenter;

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition((p) => {
      const next = { lat: p.coords.latitude, lng: p.coords.longitude };
      onChange(next);
      setRecenterTo(next);
    });
  };

  const coordinateInputs = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Latitude">
        <Input
          type="number"
          step="0.000001"
          value={value?.lat ?? ''}
          onChange={(e) => onChange({ lat: Number(e.target.value), lng: value?.lng ?? config.defaultCenter.lng })}
        />
      </Field>
      <Field label="Longitude">
        <Input
          type="number"
          step="0.000001"
          value={value?.lng ?? ''}
          onChange={(e) => onChange({ lat: value?.lat ?? config.defaultCenter.lat, lng: Number(e.target.value) })}
        />
      </Field>
    </div>
  );

  if (!mapsEnabled) {
    return (
      <div className="space-y-3">
        <MapNotConfigured message={unavailableMessage} />
        {coordinateInputs}
        <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={useMyLocation}>
          Use my location
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-line" style={{ height }}>
        <Map
          defaultCenter={position}
          defaultZoom={15}
          mapId={config.mapId}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          onClick={(e) => {
            const ll = e.detail.latLng;
            if (ll) onChange({ lat: ll.lat, lng: ll.lng });
          }}
        >
          <AdvancedMarker
            position={position}
            draggable
            onDragEnd={(e) => {
              const ll = e.latLng;
              if (ll) onChange({ lat: ll.lat(), lng: ll.lng() });
            }}
          >
            <BrandPin tone="red" />
          </AdvancedMarker>
          {recenterTo ? <Recenter center={recenterTo} /> : null}
        </Map>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Tap the map or drag the pin. {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'No location set yet.'}
        </span>
        <button type="button" className="font-semibold text-brand hover:underline" onClick={useMyLocation}>
          Use my location
        </button>
      </div>
    </div>
  );
}
