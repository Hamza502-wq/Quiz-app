'use client';

import { AdvancedMarker, InfoWindow, Map } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { BrandPin, MapNotConfigured, config, mapsEnabled, type Order } from '@doorstep/web-shared';

export interface LiveRider {
  id: string;
  name: string | null;
  phone: string;
  vehiclePlate: string;
  lat: number | null;
  lng: number | null;
  isStale: boolean;
  activeOrderId: string | null;
  locationUpdatedAt: string | null;
}

type Selected = { kind: 'rider'; rider: LiveRider } | { kind: 'order'; order: Order } | null;

/** All active orders (drop-off pins) and online riders on one map. */
export function LiveMap({ orders, riders, onSelectOrder }: { orders: Order[]; riders: LiveRider[]; onSelectOrder: (o: Order) => void }) {
  const [selected, setSelected] = useState<Selected>(null);
  if (!mapsEnabled) return <MapNotConfigured className="h-full min-h-[420px]" />;

  return (
    <Map defaultCenter={config.defaultCenter} defaultZoom={12} mapId={config.mapId} gestureHandling="greedy" className="h-full min-h-[420px] w-full">
      {orders.map((o) => (
        <AdvancedMarker key={`d-${o.id}`} position={{ lat: o.dropoff.lat, lng: o.dropoff.lng }} onClick={() => setSelected({ kind: 'order', order: o })} title={`${o.code} drop-off`}>
          <BrandPin tone={o.rider ? 'red' : 'dark'} />
        </AdvancedMarker>
      ))}
      {riders
        .filter((r) => r.lat !== null && r.lng !== null)
        .map((r) => (
          <AdvancedMarker key={`r-${r.id}`} position={{ lat: r.lat!, lng: r.lng! }} onClick={() => setSelected({ kind: 'rider', rider: r })} title={r.name ?? r.phone}>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm shadow-md ${
                r.isStale ? 'bg-gray-400' : r.activeOrderId ? 'bg-ink' : 'bg-brand'
              }`}
            >
              🛵
            </div>
          </AdvancedMarker>
        ))}
      {selected?.kind === 'rider' && selected.rider.lat !== null ? (
        <InfoWindow position={{ lat: selected.rider.lat, lng: selected.rider.lng! }} onCloseClick={() => setSelected(null)}>
          <div className="text-sm">
            <p className="font-bold">{selected.rider.name ?? selected.rider.phone}</p>
            <p>{selected.rider.vehiclePlate}</p>
            <p>{selected.rider.activeOrderId ? 'On a delivery' : 'Available'}</p>
            {selected.rider.isStale ? <p className="text-alert">Location is stale</p> : null}
          </div>
        </InfoWindow>
      ) : null}
      {selected?.kind === 'order' ? (
        <InfoWindow position={{ lat: selected.order.dropoff.lat, lng: selected.order.dropoff.lng }} onCloseClick={() => setSelected(null)}>
          <div className="text-sm">
            <p className="font-bold">{selected.order.code}</p>
            <p>{selected.order.statusLabel}</p>
            <p className="max-w-[200px]">{selected.order.dropoff.landmark}</p>
            <button type="button" className="mt-1 font-semibold text-brand" onClick={() => onSelectOrder(selected.order)}>
              {selected.order.rider ? 'View order' : 'Assign rider'}
            </button>
          </div>
        </InfoWindow>
      ) : null}
    </Map>
  );
}
