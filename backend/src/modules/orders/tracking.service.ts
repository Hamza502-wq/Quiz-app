import type { Order } from '@prisma/client';
import { haversineKm, ROAD_FACTOR, travelMinutes, type LatLng } from '../../lib/geo';
import type { PlatformSettings } from '../settings/settings.service';

/**
 * Minutes until the customer receives the order, from the rider's live position
 * when available. Before pickup this includes the leg to the pickup point and
 * any remaining preparation time.
 */
export function estimateEtaMinutes(
  order: Pick<
    Order,
    'status' | 'pickupLat' | 'pickupLng' | 'dropoffLat' | 'dropoffLng' | 'distanceKm' | 'estimatedReadyAt' | 'type'
  >,
  rider: LatLng | null,
  settings: Pick<PlatformSettings, 'riderAvgSpeedKmh'>,
  now: Date = new Date(),
): number | null {
  const speed = settings.riderAvgSpeedKmh;
  const pickup = { lat: order.pickupLat, lng: order.pickupLng };
  const dropoff = { lat: order.dropoffLat, lng: order.dropoffLng };
  const road = (a: LatLng, b: LatLng) => haversineKm(a, b) * ROAD_FACTOR;

  switch (order.status) {
    case 'PICKED_UP':
    case 'ON_THE_WAY':
      return travelMinutes(rider ? road(rider, dropoff) : order.distanceKm, speed);
    case 'PLACED':
    case 'ACCEPTED':
    case 'READY_FOR_PICKUP': {
      const prepLeft = order.estimatedReadyAt ? Math.max(0, (order.estimatedReadyAt.getTime() - now.getTime()) / 60_000) : 0;
      const toPickup = rider ? travelMinutes(road(rider, pickup), speed) : 0;
      return Math.ceil(Math.max(prepLeft, toPickup)) + travelMinutes(order.distanceKm, speed);
    }
    default:
      return null;
  }
}
