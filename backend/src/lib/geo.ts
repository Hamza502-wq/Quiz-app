import { env } from '../config/env';
import { logger } from './logger';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
/** Multiplier from straight-line to approximate road distance in Zimbabwean cities. */
export const ROAD_FACTOR = 1.3;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated road distance (km, 2 dp). */
export function roadDistanceKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR * 100) / 100;
}

/** Travel minutes at the given average speed (never less than 1). */
export function travelMinutes(distanceKm: number, avgSpeedKmh: number): number {
  return Math.max(1, Math.ceil((distanceKm / avgSpeedKmh) * 60));
}

/** Ray-casting point-in-polygon; polygon is a ring of [lat, lng] pairs. */
export function pointInPolygon(point: LatLng, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersects =
      yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isValidPolygon(value: unknown): value is Array<[number, number]> {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)),
    )
  );
}

interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number | null;
  source: 'google' | 'estimate';
}

/**
 * Driving distance between two points. Uses the Google Distance Matrix API when
 * GOOGLE_MAPS_SERVER_KEY is configured, otherwise (or on any failure) a
 * haversine × road-factor estimate.
 */
export async function routeEstimate(from: LatLng, to: LatLng): Promise<RouteEstimate> {
  const fallback: RouteEstimate = { distanceKm: roadDistanceKm(from, to), durationMinutes: null, source: 'estimate' };
  if (!env.GOOGLE_MAPS_SERVER_KEY || env.isTest) return fallback;

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', `${from.lat},${from.lng}`);
  url.searchParams.set('destinations', `${to.lat},${to.lng}`);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('key', env.GOOGLE_MAPS_SERVER_KEY);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return fallback;
    const body = (await res.json()) as {
      status: string;
      rows?: Array<{ elements: Array<{ status: string; distance?: { value: number }; duration?: { value: number } }> }>;
    };
    const el = body.rows?.[0]?.elements?.[0];
    if (body.status !== 'OK' || !el || el.status !== 'OK' || !el.distance || !el.duration) return fallback;
    return {
      distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
      durationMinutes: Math.max(1, Math.ceil(el.duration.value / 60)),
      source: 'google',
    };
  } catch (err) {
    logger.warn({ err }, 'Distance Matrix request failed; using estimate');
    return fallback;
  }
}
