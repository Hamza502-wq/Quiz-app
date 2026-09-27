import type { Prisma, Vendor, VendorOpeningHour } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/errors';
import { isOpenAt } from '../../lib/time';
import { roadDistanceKm, travelMinutes, type LatLng } from '../../lib/geo';
import { deliveryFeeCents, findZoneForPoint } from '../pricing/pricing.service';
import { getSettings } from '../settings/settings.service';

type VendorWithHours = Vendor & { openingHours: VendorOpeningHour[]; category?: { slug: string; name: string } };

export function isVendorOpen(vendor: VendorWithHours, at: Date = new Date()): boolean {
  return vendor.status === 'APPROVED' && vendor.isAcceptingOrders && isOpenAt(vendor.openingHours, at);
}

/** Public representation of a vendor (no payout details). */
export function presentVendorPublic(vendor: VendorWithHours) {
  return {
    id: vendor.id,
    name: vendor.name,
    slug: vendor.slug,
    description: vendor.description,
    phone: vendor.phone,
    logoUrl: vendor.logoUrl,
    coverUrl: vendor.coverUrl,
    lat: vendor.lat,
    lng: vendor.lng,
    addressLine: vendor.addressLine,
    landmark: vendor.landmark,
    city: vendor.city,
    category: vendor.category ? { slug: vendor.category.slug, name: vendor.category.name } : undefined,
    isOpen: isVendorOpen(vendor),
    isAcceptingOrders: vendor.isAcceptingOrders,
    avgPrepMinutes: vendor.avgPrepMinutes,
    minOrderCents: vendor.minOrderCents,
    ratingAvg: Math.round(vendor.ratingAvg * 10) / 10,
    ratingCount: vendor.ratingCount,
    openingHours: [...vendor.openingHours]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((h) => ({ dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt })),
  };
}

export interface VendorListQuery {
  category?: string;
  q?: string;
  openNow?: boolean;
  lat?: number;
  lng?: number;
  sort: 'recommended' | 'rating' | 'distance' | 'deliveryFee';
  maxDeliveryFeeCents?: number;
  minRating?: number;
  page: number;
  pageSize: number;
}

export async function listVendors(query: VendorListQuery) {
  const settings = await getSettings();
  const where: Prisma.VendorWhereInput = { status: 'APPROVED', user: { status: 'ACTIVE' } };
  if (query.category) where.category = { slug: query.category };
  if (query.minRating) where.ratingAvg = { gte: query.minRating };
  if (query.q) {
    const q = query.q;
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { products: { some: { name: { contains: q, mode: 'insensitive' }, isDeleted: false } } },
    ];
  }

  const vendors = await prisma.vendor.findMany({
    where,
    include: { openingHours: true, category: { select: { slug: true, name: true } } },
    take: 500,
  });

  const origin: LatLng | null = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  const zone = origin ? await findZoneForPoint(origin) : null;

  let rows = vendors.map((v) => {
    const base = presentVendorPublic(v);
    if (!origin) return { ...base, distanceKm: null, deliveryFeeCents: null, etaMinutes: null, deliverable: true };
    const distanceKm = roadDistanceKm({ lat: v.lat, lng: v.lng }, origin);
    return {
      ...base,
      distanceKm,
      deliveryFeeCents: deliveryFeeCents(distanceKm, settings, zone),
      etaMinutes: v.avgPrepMinutes + travelMinutes(distanceKm, settings.riderAvgSpeedKmh),
      deliverable: distanceKm <= settings.maxDeliveryKm,
    };
  });

  if (query.openNow) rows = rows.filter((r) => r.isOpen);
  if (origin) rows = rows.filter((r) => r.deliverable);
  if (query.maxDeliveryFeeCents !== undefined && origin) {
    rows = rows.filter((r) => (r.deliveryFeeCents ?? 0) <= query.maxDeliveryFeeCents!);
  }

  const byOpen = (a: (typeof rows)[number], b: (typeof rows)[number]) => Number(b.isOpen) - Number(a.isOpen);
  rows.sort((a, b) => {
    const open = byOpen(a, b);
    if (open !== 0) return open;
    switch (query.sort) {
      case 'rating':
        return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      case 'distance':
        return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      case 'deliveryFee':
        return (a.deliveryFeeCents ?? 0) - (b.deliveryFeeCents ?? 0);
      default: {
        // Recommended: rating weighted by volume, nudged by proximity.
        const score = (r: (typeof rows)[number]) =>
          r.ratingAvg * Math.min(1, r.ratingCount / 20) - (r.distanceKm ?? 0) * 0.05;
        return score(b) - score(a);
      }
    }
  });

  const total = rows.length;
  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getVendorMenu(vendorId: string, origin: LatLng | null) {
  const vendor = await prisma.vendor.findFirst({
    where: { OR: [{ id: vendorId }, { slug: vendorId }], status: 'APPROVED' },
    include: {
      openingHours: true,
      category: { select: { slug: true, name: true } },
      sections: { orderBy: { sortOrder: 'asc' } },
      products: { where: { isDeleted: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
    },
  });
  if (!vendor) throw notFound('Store');
  const settings = await getSettings();

  let delivery: { distanceKm: number; deliveryFeeCents: number; etaMinutes: number; deliverable: boolean } | null = null;
  if (origin) {
    const distanceKm = roadDistanceKm({ lat: vendor.lat, lng: vendor.lng }, origin);
    const zone = await findZoneForPoint(origin);
    delivery = {
      distanceKm,
      deliveryFeeCents: deliveryFeeCents(distanceKm, settings, zone),
      etaMinutes: vendor.avgPrepMinutes + travelMinutes(distanceKm, settings.riderAvgSpeedKmh),
      deliverable: distanceKm <= settings.maxDeliveryKm,
    };
  }

  const products = vendor.products.map(presentProduct);
  const sections = vendor.sections.map((s) => ({
    id: s.id,
    name: s.name,
    products: products.filter((p) => p.sectionId === s.id),
  }));
  const unsectioned = products.filter((p) => !p.sectionId || !vendor.sections.some((s) => s.id === p.sectionId));
  if (unsectioned.length) sections.push({ id: 'other', name: 'More items', products: unsectioned });

  return { vendor: presentVendorPublic(vendor), delivery, sections: sections.filter((s) => s.products.length > 0) };
}

export function presentProduct(p: {
  id: string;
  vendorId: string;
  sectionId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  thumbUrl: string | null;
  isAvailable: boolean;
  trackStock: boolean;
  stockQty: number;
  sortOrder: number;
}) {
  const inStock = !p.trackStock || p.stockQty > 0;
  return {
    id: p.id,
    vendorId: p.vendorId,
    sectionId: p.sectionId,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    imageUrl: p.imageUrl,
    thumbUrl: p.thumbUrl,
    isAvailable: p.isAvailable && inStock,
    trackStock: p.trackStock,
    stockQty: p.trackStock ? p.stockQty : null,
    sortOrder: p.sortOrder,
  };
}

/** Returns the vendor owned by the current user, or throws. */
export async function requireOwnVendor(userId: string, opts: { approved?: boolean } = {}) {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw notFound('Store profile — complete onboarding first');
  if (opts.approved && vendor.status !== 'APPROVED') {
    throw forbidden(
      vendor.status === 'PENDING'
        ? 'Your store is awaiting approval by the DoorStep team.'
        : `Your store is ${vendor.status.toLowerCase()}. Contact support.`,
    );
  }
  return vendor;
}
