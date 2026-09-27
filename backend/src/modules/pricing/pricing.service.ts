import type { ParcelSize, Zone } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { applyBps } from '../../lib/money';
import { isValidPolygon, pointInPolygon, haversineKm, type LatLng } from '../../lib/geo';
import type { PlatformSettings } from '../settings/settings.service';

/** Finds the active service zone containing `point` (smallest radius wins). */
export async function findZoneForPoint(point: LatLng): Promise<Zone | null> {
  const zones = await prisma.zone.findMany({ where: { isActive: true }, orderBy: { radiusKm: 'asc' } });
  return zones.find((z) => zoneContains(z, point)) ?? null;
}

export function zoneContains(zone: Pick<Zone, 'centerLat' | 'centerLng' | 'radiusKm' | 'polygon'>, point: LatLng): boolean {
  if (isValidPolygon(zone.polygon)) return pointInPolygon(point, zone.polygon);
  return haversineKm({ lat: zone.centerLat, lng: zone.centerLng }, point) <= zone.radiusKm;
}

/** True when zones are configured — deliveries must then fall inside one. */
export async function zonesConfigured(): Promise<boolean> {
  return (await prisma.zone.count({ where: { isActive: true } })) > 0;
}

type ZoneRates = Pick<Zone, 'deliveryFeeBaseCents' | 'deliveryFeePerKmCents' | 'riderBaseCents' | 'riderPerKmCents'> | null;

/** Customer-facing delivery fee: base + per-km (zone overrides global), never below the minimum. */
export function deliveryFeeCents(distanceKm: number, settings: PlatformSettings, zone: ZoneRates): number {
  const base = zone?.deliveryFeeBaseCents ?? settings.deliveryFeeBaseCents;
  const perKm = zone?.deliveryFeePerKmCents ?? settings.deliveryFeePerKmCents;
  return Math.max(settings.minDeliveryFeeCents, Math.round(base + perKm * distanceKm));
}

/** Rider pay for a delivery: base + per-km (zone overrides global). Tips and bonuses are separate. */
export function riderPayCents(distanceKm: number, settings: PlatformSettings, zone: ZoneRates): number {
  const base = zone?.riderBaseCents ?? settings.riderBaseCents;
  const perKm = zone?.riderPerKmCents ?? settings.riderPerKmCents;
  return Math.round(base + perKm * distanceKm);
}

export function parcelSurcharge(size: ParcelSize, settings: PlatformSettings): number {
  return settings.parcelSurchargeCents[size];
}

export interface Breakdown {
  subtotalCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  commissionRateBps: number;
  commissionCents: number;
  vendorEarningCents: number;
  riderEarningCents: number;
}

export function buildBreakdown(input: {
  subtotalCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  commissionRateBps: number;
  riderEarningCents: number;
}): Breakdown {
  const commissionCents = applyBps(input.subtotalCents, input.commissionRateBps);
  return {
    subtotalCents: input.subtotalCents,
    deliveryFeeCents: input.deliveryFeeCents,
    tipCents: input.tipCents,
    totalCents: input.subtotalCents + input.deliveryFeeCents + input.tipCents,
    commissionRateBps: input.commissionRateBps,
    commissionCents,
    vendorEarningCents: input.subtotalCents - commissionCents,
    riderEarningCents: input.riderEarningCents,
  };
}
