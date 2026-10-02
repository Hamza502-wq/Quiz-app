import type { Order, OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { haversineKm, roadDistanceKm } from '../../lib/geo';
import { formatMoney } from '../../lib/money';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { getSettings } from '../settings/settings.service';
import { canTakeCashOrder, getCashLimitCents, getCashOwedCents } from '../wallet/wallet.service';
import { notify, notifyAsync } from '../notifications/notification.service';
import { publishOrderUpdate } from '../orders/order.events';
import { ACTIVE_STATUSES } from '../orders/order.presenter';
import { runInBackground } from '../../lib/background';

/** Statuses in which an order can receive a rider. */
export const DISPATCHABLE_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'READY_FOR_PICKUP'];

/** Declined/expired offers only exclude a rider from re-offers for this long. */
const EXCLUSION_WINDOW_MS = 10 * 60_000;

function isDispatchable(order: Pick<Order, 'type' | 'status' | 'riderId'>): boolean {
  if (order.riderId) return false;
  if (!DISPATCHABLE_STATUSES.includes(order.status)) return false;
  // Vendor orders wait for the store to accept before a rider is sent.
  return order.type === 'PARCEL' || order.status !== 'PLACED';
}

export async function riderHasActiveOrder(riderId: string): Promise<boolean> {
  const count = await prisma.order.count({ where: { riderId, status: { in: ACTIVE_STATUSES } } });
  return count > 0;
}

export interface Candidate {
  riderId: string;
  userId: string;
  name: string | null;
  phone: string;
  distanceKm: number;
  lat: number;
  lng: number;
  cashOwedCents: number;
  cashLimitCents: number;
  canTakeCash: boolean;
  vehicleType: string;
  ratingAvg: number;
}

/**
 * Online, approved, idle riders near the pickup point, nearest first.
 * `enforceRadius=false` lists everyone (admin manual assignment view).
 */
export async function findCandidates(
  order: Pick<Order, 'id' | 'pickupLat' | 'pickupLng' | 'paymentMethod' | 'totalCents'>,
  opts: { excludeRiderIds?: string[]; enforceRadius?: boolean; requireCashCapacity?: boolean } = {},
): Promise<Candidate[]> {
  const settings = await getSettings();
  const staleBefore = new Date(Date.now() - settings.riderLocationStaleMinutes * 60_000);
  const riders = await prisma.rider.findMany({
    where: {
      status: 'APPROVED',
      isOnline: true,
      lat: { not: null },
      lng: { not: null },
      locationUpdatedAt: { gte: staleBefore },
      user: { status: 'ACTIVE' },
      id: { notIn: opts.excludeRiderIds ?? [] },
      orders: { none: { status: { in: ACTIVE_STATUSES } } },
      offers: { none: { status: 'OFFERED', expiresAt: { gt: new Date() } } },
    },
    include: { user: { select: { name: true, phone: true } }, wallet: { select: { balanceCents: true } } },
  });

  const pickup = { lat: order.pickupLat, lng: order.pickupLng };
  const candidates: Candidate[] = [];
  for (const r of riders) {
    const distanceKm = Math.round(haversineKm({ lat: r.lat!, lng: r.lng! }, pickup) * 100) / 100;
    if (opts.enforceRadius !== false && distanceKm > settings.dispatchRadiusKm) continue;
    const cashOwedCents = Math.max(0, -(r.wallet?.balanceCents ?? 0));
    const cashLimitCents = r.cashLimitCents ?? settings.defaultCashLimitCents;
    const canTakeCash = order.paymentMethod !== 'CASH' || cashOwedCents + order.totalCents <= cashLimitCents;
    if (opts.requireCashCapacity !== false && !canTakeCash) continue;
    candidates.push({
      riderId: r.id,
      userId: r.userId,
      name: r.user.name,
      phone: r.user.phone,
      distanceKm,
      lat: r.lat!,
      lng: r.lng!,
      cashOwedCents,
      cashLimitCents,
      canTakeCash,
      vehicleType: r.vehicleType,
      ratingAvg: r.ratingAvg,
    });
  }
  return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Payload a rider sees when offered a job (no customer phone until accepted). */
async function offerPayload(offerId: string) {
  const offer = await prisma.dispatchOffer.findUniqueOrThrow({
    where: { id: offerId },
    include: { order: { include: { vendor: { select: { name: true } }, items: { select: { quantity: true } } } } },
  });
  const o = offer.order;
  return {
    offerId: offer.id,
    expiresAt: offer.expiresAt,
    distanceToPickupKm: offer.distanceKm,
    order: {
      id: o.id,
      code: o.code,
      type: o.type,
      vendorName: o.vendor?.name ?? null,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      pickup: { lat: o.pickupLat, lng: o.pickupLng, address: o.pickupAddress, landmark: o.pickupLandmark },
      dropoff: { lat: o.dropoffLat, lng: o.dropoffLng, address: o.dropoffAddress, landmark: o.dropoffLandmark },
      distanceKm: o.distanceKm,
      riderEarningCents: o.riderEarningCents,
      tipCents: o.tipCents,
      paymentMethod: o.paymentMethod,
      cashToCollectCents: o.paymentMethod === 'CASH' ? o.totalCents : 0,
      currency: o.currency,
      exchangeRate: o.exchangeRate,
    },
  };
}

export type OfferPayload = Awaited<ReturnType<typeof offerPayload>>;

export async function getOfferPayload(offerId: string): Promise<OfferPayload> {
  return offerPayload(offerId);
}

/**
 * Offers the order to the nearest eligible rider who hasn't recently declined
 * it. Returns the offer id, or null when no rider is available (the sweeper
 * retries later).
 */
export async function offerToNextRider(orderId: string): Promise<string | null> {
  const settings = await getSettings();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !isDispatchable(order)) return null;

  const pending = await prisma.dispatchOffer.findFirst({
    where: { orderId, status: 'OFFERED', expiresAt: { gt: new Date() } },
  });
  if (pending) return pending.id;

  const recent = await prisma.dispatchOffer.findMany({
    where: { orderId, createdAt: { gte: new Date(Date.now() - EXCLUSION_WINDOW_MS) } },
    select: { riderId: true },
  });
  const candidates = await findCandidates(order, { excludeRiderIds: recent.map((r) => r.riderId) });
  const next = candidates[0];
  if (!next) return null;

  const offer = await prisma.dispatchOffer.create({
    data: {
      orderId,
      riderId: next.riderId,
      distanceKm: next.distanceKm,
      expiresAt: new Date(Date.now() + settings.dispatchOfferTimeoutSec * 1000),
    },
  });
  const payload = await offerPayload(offer.id);
  emitTo(rooms.rider(next.riderId), ServerEvents.dispatchOffer, payload);
  notifyAsync({
    userId: next.userId,
    type: 'DISPATCH_OFFER',
    title: 'New delivery request',
    body: `${payload.order.vendorName ?? 'Parcel'} • ${order.distanceKm.toFixed(1)} km • earn ${formatMoney(
      order.riderEarningCents + order.tipCents,
      'USD',
    )}`,
    data: { offerId: offer.id, orderId },
  });
  logger.info({ orderId, riderId: next.riderId, offerId: offer.id }, 'Dispatch offer sent');
  return offer.id;
}

/** Starts automatic dispatch if enabled in settings. */
export async function startAutoDispatch(orderId: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.autoDispatchEnabled) return;
  try {
    await offerToNextRider(orderId);
  } catch (err) {
    logger.error({ err, orderId }, 'Auto-dispatch failed');
  }
}

async function assertRiderCanTake(riderId: string, order: Order): Promise<void> {
  if (await riderHasActiveOrder(riderId)) throw conflict('Finish your current delivery before taking another.');
  if (order.paymentMethod === 'CASH' && !(await canTakeCashOrder(riderId, order.totalCents))) {
    const [owed, limit] = await Promise.all([getCashOwedCents(riderId), getCashLimitCents(riderId)]);
    throw conflict(
      `Cash limit reached: you owe ${formatMoney(owed, 'USD')} of your ${formatMoney(limit, 'USD')} limit. Remit cash to take cash orders.`,
    );
  }
}

export async function acceptOffer(riderId: string, offerId: string) {
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId }, include: { order: true } });
  if (!offer || offer.riderId !== riderId) throw notFound('Delivery request');
  if (offer.status !== 'OFFERED') throw conflict('This request is no longer available.');
  if (offer.expiresAt < new Date()) throw conflict('This request has expired.');
  await assertRiderCanTake(riderId, offer.order);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.dispatchOffer.updateMany({
      where: { id: offerId, status: 'OFFERED' },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    if (claimed.count === 0) throw conflict('This request is no longer available.');
    const assigned = await tx.order.updateMany({
      where: { id: offer.orderId, riderId: null, status: { in: DISPATCHABLE_STATUSES } },
      data: { riderId, assignedAt: new Date() },
    });
    if (assigned.count === 0) throw conflict('This order has already been taken.');
    await tx.orderEvent.create({
      data: { orderId: offer.orderId, type: 'RIDER_ASSIGNED', message: 'Rider accepted the delivery', actorId: riderId },
    });
  });

  await afterAssignment(offer.orderId);
  return { ok: true, orderId: offer.orderId };
}

export async function declineOffer(riderId: string, offerId: string) {
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.riderId !== riderId) throw notFound('Delivery request');
  const updated = await prisma.dispatchOffer.updateMany({
    where: { id: offerId, status: 'OFFERED' },
    data: { status: 'DECLINED', respondedAt: new Date() },
  });
  if (updated.count > 0) runInBackground(startAutoDispatch(offer.orderId), 'dispatch');
  return { ok: true };
}

/** Admin assigns a specific rider. Any outstanding offer for the order is withdrawn. */
export async function manualAssign(orderId: string, riderId: string, adminUserId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order');
  if (order.riderId) throw conflict('A rider is already assigned. Unassign them first.');
  if (!DISPATCHABLE_STATUSES.includes(order.status)) throw badRequest('This order cannot be assigned right now.');

  const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: { user: true } });
  if (!rider || rider.status !== 'APPROVED' || rider.user.status !== 'ACTIVE') {
    throw badRequest('Rider must be approved and active.');
  }
  await assertRiderCanTake(riderId, order);

  const pickupDistance =
    rider.lat !== null && rider.lng !== null
      ? roadDistanceKm({ lat: rider.lat, lng: rider.lng }, { lat: order.pickupLat, lng: order.pickupLng })
      : null;

  const withdrawn = await prisma.$transaction(async (tx) => {
    const open = await tx.dispatchOffer.findMany({ where: { orderId, status: 'OFFERED' } });
    await tx.dispatchOffer.updateMany({ where: { orderId, status: 'OFFERED' }, data: { status: 'CANCELLED' } });
    const assigned = await tx.order.updateMany({
      where: { id: orderId, riderId: null, status: { in: DISPATCHABLE_STATUSES } },
      data: { riderId, assignedAt: new Date() },
    });
    if (assigned.count === 0) throw conflict('This order was just assigned to someone else.');
    await tx.dispatchOffer.create({
      data: {
        orderId,
        riderId,
        status: 'ACCEPTED',
        isManual: true,
        distanceKm: pickupDistance,
        expiresAt: new Date(),
        respondedAt: new Date(),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'RIDER_ASSIGNED',
        message: `Assigned to ${rider.user.name ?? 'rider'} by admin`,
        actorId: adminUserId,
      },
    });
    return open;
  });

  for (const o of withdrawn) emitTo(rooms.rider(o.riderId), ServerEvents.dispatchOfferCancelled, { offerId: o.id, orderId });
  await notify({
    userId: rider.userId,
    type: 'ORDER_ASSIGNED',
    title: 'New delivery assigned',
    body: `Order ${order.code} has been assigned to you. Head to the pickup point.`,
    data: { orderId },
    fallbackToSms: true,
  });
  await afterAssignment(orderId);
  return { ok: true };
}

/** Rider hands back an assigned order before pickup; it goes back to dispatch. */
export async function riderReleaseOrder(riderId: string, orderId: string, reason: string | undefined) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.riderId !== riderId) throw notFound('Order');
  if (!DISPATCHABLE_STATUSES.includes(order.status)) throw conflict('You can only decline before pickup.');

  await prisma.$transaction(async (tx) => {
    const released = await tx.order.updateMany({
      where: { id: orderId, riderId, status: { in: DISPATCHABLE_STATUSES } },
      data: { riderId: null, assignedAt: null },
    });
    if (released.count === 0) throw conflict('Order changed; please refresh.');
    // Record as a declined offer so auto-dispatch skips this rider for a while.
    await tx.dispatchOffer.create({
      data: { orderId, riderId, status: 'DECLINED', expiresAt: new Date(), respondedAt: new Date() },
    });
    await tx.orderEvent.create({
      data: { orderId, type: 'RIDER_UNASSIGNED', message: reason ? `Rider declined: ${reason}` : 'Rider declined', actorId: riderId },
    });
  });
  await publishOrderUpdate(orderId);
  runInBackground(startAutoDispatch(orderId), 'dispatch');
  return { ok: true };
}

/** Admin removes the assigned rider before pickup. */
export async function adminUnassign(orderId: string, adminUserId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { rider: true } });
  if (!order || !order.riderId || !order.rider) throw notFound('Assigned rider');
  if (!DISPATCHABLE_STATUSES.includes(order.status)) throw conflict('The rider has already picked up this order.');
  const riderUserId = order.rider.userId;
  const released = await prisma.order.updateMany({
    where: { id: orderId, riderId: order.riderId, status: { in: DISPATCHABLE_STATUSES } },
    data: { riderId: null, assignedAt: null },
  });
  if (released.count === 0) throw conflict('Order changed; please refresh.');
  await prisma.orderEvent.create({
    data: { orderId, type: 'RIDER_UNASSIGNED', message: 'Rider unassigned by admin', actorId: adminUserId },
  });
  notifyAsync({
    userId: riderUserId,
    type: 'ORDER_UNASSIGNED',
    title: 'Delivery reassigned',
    body: `Order ${order.code} has been reassigned by DoorStep support.`,
    data: { orderId },
  });
  emitTo(rooms.rider(order.riderId), ServerEvents.orderUpdated, { id: orderId, unassigned: true });
  await publishOrderUpdate(orderId);
  return { ok: true };
}

async function afterAssignment(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, rider: { include: { user: true } } },
  });
  if (!order?.rider) return;
  const plate = order.rider.vehiclePlate ? ` (${order.rider.vehiclePlate})` : '';
  notifyAsync({
    userId: order.customer.userId,
    type: 'RIDER_ASSIGNED',
    title: 'Rider on the way to pickup',
    body: `${order.rider.user.name ?? 'Your rider'}${plate} is handling order ${order.code}.`,
    data: { orderId },
  });
  await publishOrderUpdate(orderId);
}

/** Withdraws open offers for an order (e.g. it was cancelled). */
export async function cancelOpenOffers(orderId: string): Promise<void> {
  const open = await prisma.dispatchOffer.findMany({ where: { orderId, status: 'OFFERED' } });
  if (open.length === 0) return;
  await prisma.dispatchOffer.updateMany({ where: { orderId, status: 'OFFERED' }, data: { status: 'CANCELLED' } });
  for (const o of open) emitTo(rooms.rider(o.riderId), ServerEvents.dispatchOfferCancelled, { offerId: o.id, orderId });
}

/**
 * Periodic job: expires unanswered offers and re-offers them, and retries
 * dispatch for orders still waiting for a rider.
 */
export async function runDispatchSweep(): Promise<void> {
  const expired = await prisma.dispatchOffer.findMany({
    where: { status: 'OFFERED', expiresAt: { lte: new Date() } },
    select: { id: true, orderId: true, riderId: true },
  });
  for (const offer of expired) {
    const res = await prisma.dispatchOffer.updateMany({
      where: { id: offer.id, status: 'OFFERED' },
      data: { status: 'EXPIRED' },
    });
    if (res.count > 0) emitTo(rooms.rider(offer.riderId), ServerEvents.dispatchOfferCancelled, { offerId: offer.id, orderId: offer.orderId });
  }

  const settings = await getSettings();
  if (!settings.autoDispatchEnabled) return;
  const waiting = await prisma.order.findMany({
    where: {
      riderId: null,
      OR: [
        { type: 'PARCEL', status: 'PLACED' },
        { type: 'DELIVERY', status: { in: ['ACCEPTED', 'READY_FOR_PICKUP'] } },
      ],
      offers: { none: { status: 'OFFERED' } },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  for (const o of waiting) {
    try {
      await offerToNextRider(o.id);
    } catch (err) {
      logger.error({ err, orderId: o.id }, 'Dispatch retry failed');
    }
  }
}
