'use client';

import { useEffect } from 'react';
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { BrandPin, config, mapsEnabled, type LatLng } from '@doorstep/web-shared';

/** Store/pickup (orange), drop-off (red) and the rider's live position. */
export function TrackingMap({
  pickup,
  dropoff,
  rider,
  className,
}: {
  pickup: LatLng;
  dropoff: LatLng;
  rider: LatLng | null;
  className?: string;
}) {
  // Without a Maps key the page still shows status and ETA; skip the empty map box.
  if (!mapsEnabled) return null;
  return (
    <div className={`overflow-hidden rounded-2xl border border-line ${className ?? ''}`}>
      <Map defaultCenter={dropoff} defaultZoom={13} mapId={config.mapId} gestureHandling="cooperative" disableDefaultUI zoomControl className="h-full w-full">
        <AdvancedMarker position={pickup} title="Pickup">
          <BrandPin tone="orange" />
        </AdvancedMarker>
        <AdvancedMarker position={dropoff} title="Your drop-off">
          <BrandPin tone="red" />
        </AdvancedMarker>
        {rider ? (
          <AdvancedMarker position={rider} title="Your rider">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-ink text-base shadow-lg" aria-label="Rider">
              🛵
            </div>
          </AdvancedMarker>
        ) : null}
        <FitBounds points={rider ? [pickup, dropoff, rider] : [pickup, dropoff]} />
      </Map>
    </div>
  );
}

/** Fits the map to the markers once, and again when the rider first appears. */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.length;
  useEffect(() => {
    if (!map) return;
    map.fitBounds(
      {
        north: Math.max(...points.map((p) => p.lat)),
        south: Math.min(...points.map((p) => p.lat)),
        east: Math.max(...points.map((p) => p.lng)),
        west: Math.min(...points.map((p) => p.lng)),
      },
      60,
    );
    // Refit only when the number of markers changes, not on every rider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

