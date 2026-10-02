import type { PayoutMethod } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import { safeEqual } from '../../lib/random';
import { isoWeekKey, localParts, startOfLocalDay, startOfLocalWeek } from '../../lib/time';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { getSettings } from '../settings/settings.service';
import { ensureWallet, getWalletSummary, postWalletEntry } from '../wallet/wallet.service';
import { notifyAdminsAsync } from '../notifications/notification.service';
import { ACTIVE_STATUSES, orderInclude, presentOrder } from '../orders/order.presenter';
import { transitionOrder } from '../orders/order.service';
import { estimateEtaMinutes } from '../orders/tracking.service';
import { getOfferPayload } from '../dispatch/dispatch.service';

export async function requireRider(userId: string, opts: { approved?: boolean } = {}) {
  const rider = await prisma.rider.findUnique({ where: { userId } });
  if (!rider) throw notFound('Rider profile — complete registration first');
  if (opts.approved && rider.status !== 'APPROVED') {
    throw forbidden(
      rider.status === 'PENDING'
        ? 'Your registration is awaiting approval.'
        : `Your rider account is ${rider.status.toLowerCase()}. Contact support.`,
    );
  }
  return rider;
}

/** Documents must be private uploads made by this same user. */
export function assertOwnPrivateUpload(userId: string, url: string | undefined | null, label: string) {
  if (!url) return;
  const prefix = `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/v1/uploads/private/${userId}/`;
  if (!url.startsWith(prefix)) throw badRequest(`${label} must be uploaded from the app`);
}

export interface RiderRegistration {
  nationalId: string;
  idDocumentUrl: string;
  licenceNumber: string;
  licenceDocumentUrl: string;
  licenceExpiry?: Date;
  vehicleType: 'MOTORBIKE' | 'BICYCLE' | 'CAR';
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate: string;
  vehicleColor?: string;
  vehiclePhotoUrl?: string;
  name?: string;
}

export async function registerRider(userId: string, input: RiderRegistration) {
  assertOwnPrivateUpload(userId, input.idDocumentUrl, 'ID document');
  assertOwnPrivateUpload(userId, input.licenceDocumentUrl, 'Licence document');
  if (input.licenceExpiry && input.licenceExpiry < new Date()) throw badRequest('Your licence has expired.');

  const existing = await prisma.rider.findUnique({ where: { userId } });
  if (existing && existing.status !== 'REJECTED') throw conflict('You have already registered.');
  const { name, ...data } = input;

  const rider = await prisma.$transaction(async (tx) => {
    if (name) await tx.user.update({ where: { id: userId }, data: { name } });
    const r = existing
      ? await tx.rider.update({ where: { id: existing.id }, data: { ...data, status: 'PENDING', rejectionReason: null } })
      : await tx.rider.create({ data: { ...data, userId } });
    await ensureWallet(tx, r.id);
    return r;
  });
  notifyAdminsAsync({
    type: 'RIDER_PENDING',
    title: 'Rider awaiting approval',
    body: `${name ?? 'A new rider'} (${input.vehiclePlate}) submitted documents for review.`,
    data: { riderId: rider.id },
  });
  return rider;
}

export async function getRiderDashboard(userId: string) {
  const rider = await prisma.rider.findUnique({
    where: { userId },
    include: { user: { select: { name: true, phone: true } }, zone: { select: { id: true, name: true } } },
  });
  if (!rider) return { registered: false as const };

  const [wallet, activeOrder, offer, todayStats, weekStats] = await Promise.all([
    getWalletSummary(rider.id),
    prisma.order.findFirst({ where: { riderId: rider.id, status: { in: ACTIVE_STATUSES } }, include: orderInclude }),
    prisma.dispatchOffer.findFirst({
      where: { riderId: rider.id, status: 'OFFERED', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
    deliveryStats(rider.id, startOfLocalDay()),
    deliveryStats(rider.id, startOfLocalWeek()),
  ]);

  return {
    registered: true as const,
    rider: {
      id: rider.id,
      name: rider.user.name,
      phone: rider.user.phone,
      status: rider.status,
      rejectionReason: rider.rejectionReason,
      isOnline: rider.isOnline,
      vehicleType: rider.vehicleType,
      vehicleMake: rider.vehicleMake,
      vehicleModel: rider.vehicleModel,
      vehiclePlate: rider.vehiclePlate,
      vehicleColor: rider.vehicleColor,
      ratingAvg: Math.round(rider.ratingAvg * 10) / 10,
      ratingCount: rider.ratingCount,
      zone: rider.zone,
      payoutMethod: rider.payoutMethod,
      payoutAccount: rider.payoutAccount,
      payoutAccountName: rider.payoutAccountName,
      payoutBankName: rider.payoutBankName,
    },
    wallet,
    activeOrder: activeOrder ? presentOrder(activeOrder, 'rider') : null,
    pendingOffer: offer ? await getOfferPayload(offer.id) : null,
    stats: { today: todayStats, week: weekStats },
  };
}

async function deliveryStats(riderId: string, since: Date) {
  const [deliveries, earnings] = await Promise.all([
    prisma.order.count({ where: { riderId, status: 'DELIVERED', deliveredAt: { gte: since } } }),
    prisma.walletTransaction.aggregate({
      where: {
        wallet: { riderId },
        type: { in: ['DELIVERY_FEE', 'TIP', 'BONUS'] },
        createdAt: { gte: since },
      },
      _sum: { amountCents: true },
    }),
  ]);
  return { deliveries, earningsCents: earnings._sum.amountCents ?? 0 };
}

export async function setOnline(userId: string, online: boolean, location?: { lat: number; lng: number }) {
  const rider = await requireRider(userId, { approved: true });
  if (!online) {
    const active = await prisma.order.count({ where: { riderId: rider.id, status: { in: ACTIVE_STATUSES } } });
    if (active > 0) throw conflict('Complete your current delivery before going offline.');
    await prisma.dispatchOffer.updateMany({ where: { riderId: rider.id, status: 'OFFERED' }, data: { status: 'DECLINED', respondedAt: new Date() } });
  }
  const updated = await prisma.rider.update({
    where: { id: rider.id },
    data: {
      isOnline: online,
      ...(location ? { lat: location.lat, lng: location.lng, locationUpdatedAt: new Date() } : {}),
    },
  });
  emitTo(rooms.admins, ServerEvents.riderStatus, {
    riderId: rider.id,
    isOnline: online,
    lat: updated.lat,
    lng: updated.lng,
  });
  return { isOnline: updated.isOnline };
}

// ───────────────────────────── Live location ─────────────────────────────

const DB_WRITE_INTERVAL_MS = 4_000;
const lastWrite = new Map<string, number>();

export interface LocationUpdate {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

/**
 * Records a rider's position (DB writes throttled) and streams it to the
 * customer of the active order and to the admin live map.
 */
export async function updateRiderLocation(riderId: string, loc: LocationUpdate): Promise<void> {
  const now = Date.now();
  if ((lastWrite.get(riderId) ?? 0) < now - DB_WRITE_INTERVAL_MS) {
    lastWrite.set(riderId, now);
    await prisma.rider.update({
      where: { id: riderId },
      data: { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, locationUpdatedAt: new Date(now) },
    });
  }

  const order = await prisma.order.findFirst({
    where: { riderId, status: { in: ACTIVE_STATUSES } },
    select: {
      id: true,
      status: true,
      type: true,
      pickupLat: true,
      pickupLng: true,
      dropoffLat: true,
      dropoffLng: true,
      distanceKm: true,
      estimatedReadyAt: true,
    },
  });
  if (order) {
    const settings = await getSettings();
    emitTo(rooms.order(order.id), ServerEvents.riderLocation, {
      orderId: order.id,
      lat: loc.lat,
      lng: loc.lng,
      heading: loc.heading ?? null,
      etaMinutes: estimateEtaMinutes(order, loc, settings),
      at: new Date(now).toISOString(),
    });
  }
  emitTo(rooms.admins, ServerEvents.riderLocationAdmin, {
    riderId,
    lat: loc.lat,
    lng: loc.lng,
    heading: loc.heading ?? null,
    activeOrderId: order?.id ?? null,
    at: new Date(now).toISOString(),
  });
}

// ───────────────────────────── Delivery flow ─────────────────────────────

async function riderOrder(userId: string, orderId: string) {
  const rider = await requireRider(userId, { approved: true });
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.riderId !== rider.id) throw notFound('Order');
  return { rider, order };
}

export async function markPickedUp(userId: string, orderId: string) {
  const { order } = await riderOrder(userId, orderId);
  const from = order.type === 'PARCEL' ? (['PLACED'] as const) : (['ACCEPTED', 'READY_FOR_PICKUP'] as const);
  if (!from.includes(order.status as never)) {
    throw conflict(order.status === 'PLACED' ? 'Wait for the store to accept the order.' : 'This order cannot be picked up now.');
  }
  await transitionOrder(orderId, 'PICKED_UP', { actorId: userId, from: [...from] });
}

export async function markOnTheWay(userId: string, orderId: string) {
  await riderOrder(userId, orderId);
  await transitionOrder(orderId, 'ON_THE_WAY', { actorId: userId, from: ['PICKED_UP'] });
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 10 * 60_000;
const pinFailures = new Map<string, { count: number; lockedUntil: number }>();

export async function markDelivered(
  userId: string,
  orderId: string,
  proof: { proofType: 'PIN' | 'PHOTO'; pin?: string; photoUrl?: string },
) {
  const { order } = await riderOrder(userId, orderId);
  if (order.status !== 'PICKED_UP' && order.status !== 'ON_THE_WAY') throw conflict('Pick up the order first.');

  if (proof.proofType === 'PIN') {
    const state = pinFailures.get(orderId);
    if (state && state.lockedUntil > Date.now()) {
      throw tooMany('Too many wrong PINs. Take a photo as proof of delivery instead.');
    }
    if (!proof.pin || !safeEqual(proof.pin, order.deliveryPin)) {
      const count = (state?.count ?? 0) + 1;
      pinFailures.set(orderId, { count, lockedUntil: count >= PIN_MAX_ATTEMPTS ? Date.now() + PIN_LOCK_MS : 0 });
      throw badRequest(
        count >= PIN_MAX_ATTEMPTS
          ? 'Too many wrong PINs. Take a photo as proof of delivery instead.'
          : `Incorrect PIN. Ask the customer for the 4-digit PIN shown in their app.`,
      );
    }
    pinFailures.delete(orderId);
  } else {
    if (!proof.photoUrl) throw badRequest('Attach a photo of the delivered order.');
    assertOwnPrivateUpload(userId, proof.photoUrl, 'Proof photo');
  }

  await transitionOrder(orderId, 'DELIVERED', {
    actorId: userId,
    from: ['PICKED_UP', 'ON_THE_WAY'],
    message: proof.proofType === 'PIN' ? 'Delivered — PIN confirmed' : 'Delivered — photo proof',
    data: { proofType: proof.proofType, proofPhotoUrl: proof.proofType === 'PHOTO' ? proof.photoUrl : null },
  });
}

// ───────────────────────────── Payouts ─────────────────────────────

export interface PayoutRequest {
  amountCents?: number;
  method?: PayoutMethod;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
}

export async function requestRiderPayout(userId: string, input: PayoutRequest, isAutomatic = false) {
  const rider = await requireRider(userId, { approved: true });
  const settings = await getSettings();
  const wallet = await ensureWallet(prisma, rider.id);

  const method = input.method ?? rider.payoutMethod;
  const accountNumber = input.accountNumber ?? rider.payoutAccount;
  if (!method || !accountNumber) throw badRequest('Add your payout method and account number first.');
  if (method === 'BANK' && !(input.bankName ?? rider.payoutBankName)) throw badRequest('Bank name is required for bank payouts.');

  const amount = input.amountCents ?? wallet.balanceCents;
  if (amount < settings.minPayoutCents) {
    throw badRequest(`Minimum payout is ${formatMoney(settings.minPayoutCents, 'USD')}.`);
  }
  if (amount > wallet.balanceCents) {
    throw badRequest(`You can withdraw up to ${formatMoney(Math.max(0, wallet.balanceCents), 'USD')}.`);
  }

  if (!isAutomatic && !settings.allowOnDemandPayouts) {
    const weekStart = startOfLocalWeek();
    const already = await prisma.payout.count({
      where: { riderId: rider.id, payeeType: 'RIDER', requestedAt: { gte: weekStart }, status: { not: 'REJECTED' } },
    });
    if (already > 0) throw conflict(`Payouts are weekly — you've already requested one this week (${isoWeekKey()}).`);
  }
  const pending = await prisma.payout.count({ where: { riderId: rider.id, status: { in: ['PENDING', 'PROCESSING'] } } });
  if (pending > 0) throw conflict('You already have a payout being processed.');

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.payout.create({
      data: {
        payeeType: 'RIDER',
        riderId: rider.id,
        amountCents: amount,
        method,
        accountNumber,
        accountName: input.accountName ?? rider.payoutAccountName,
        bankName: method === 'BANK' ? (input.bankName ?? rider.payoutBankName) : null,
        isAutomatic,
      },
    });
    // Re-check the balance inside the transaction to prevent double withdrawal.
    const fresh = await tx.riderWallet.findUniqueOrThrow({ where: { riderId: rider.id } });
    if (fresh.balanceCents < amount) throw conflict('Your balance changed. Please try again.');
    await postWalletEntry(tx, rider.id, {
      type: 'PAYOUT',
      amountCents: -amount,
      description: `Payout to ${method === 'BANK' ? 'bank' : method === 'ECOCASH' ? 'EcoCash' : 'OneMoney'} ${accountNumber}`,
      payoutId: created.id,
    });
    return created;
  });
  logger.info({ riderId: rider.id, payoutId: payout.id, amount }, 'Rider payout requested');
  return payout;
}

/** Weekly job: creates payouts for riders with a positive balance and payout details. */
export async function runWeeklyRiderPayouts(force = false): Promise<number> {
  const settings = await getSettings();
  const today = new Date();
  if (!force && localParts(today).weekday !== settings.payoutDayOfWeek) return 0;

  const weekStart = startOfLocalWeek(today);
  const riders = await prisma.rider.findMany({
    where: {
      status: 'APPROVED',
      payoutMethod: { not: null },
      payoutAccount: { not: null },
      wallet: { balanceCents: { gte: settings.minPayoutCents } },
      payouts: {
        none: {
          OR: [{ status: { in: ['PENDING', 'PROCESSING'] } }, { requestedAt: { gte: weekStart }, status: { not: 'REJECTED' } }],
        },
      },
    },
    select: { userId: true, id: true },
  });
  let created = 0;
  for (const r of riders) {
    try {
      await requestRiderPayout(r.userId, {}, true);
      created++;
    } catch (err) {
      logger.warn({ err, riderId: r.id }, 'Automatic payout skipped');
    }
  }
  if (created > 0) logger.info({ created }, 'Weekly rider payouts created');
  return created;
}
