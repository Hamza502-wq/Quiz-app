import { Prisma, type Currency, type OrderStatus, type ParcelSize, type PaymentMethod } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { routeEstimate, travelMinutes, type LatLng } from '../../lib/geo';
import { convertFromUsd, formatMoney } from '../../lib/money';
import { orderCode, randomDigits } from '../../lib/random';
import type { AuthUser } from '../../middleware/auth';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { getSettings } from '../settings/settings.service';
import {
  buildBreakdown,
  deliveryFeeCents,
  findZoneForPoint,
  parcelSurcharge,
  riderPayCents,
  zonesConfigured,
} from '../pricing/pricing.service';
import { isVendorOpen } from '../vendors/vendor.service';
import { postWalletEntry } from '../wallet/wallet.service';
import { checkAndAwardBonuses } from '../wallet/bonus.service';
import { notifyAsync } from '../notifications/notification.service';
import { cancelOpenOffers, startAutoDispatch } from '../dispatch/dispatch.service';
import { publishOrderUpdate } from './order.events';
import {
  ACTIVE_STATUSES,
  orderDetailInclude,
  orderInclude,
  presentOrder,
  STATUS_LABELS,
  type OrderViewer,
} from './order.presenter';

// ───────────────────────────── Drop-off resolution ─────────────────────────────

export interface DropoffInput {
  addressId?: string;
  dropoff?: { lat: number; lng: number; landmark: string; street?: string; suburb?: string; city?: string };
}

interface ResolvedDropoff extends LatLng {
  address: string;
  landmark: string;
}

async function resolveDropoff(customerId: string, input: DropoffInput): Promise<ResolvedDropoff> {
  if (input.addressId) {
    const addr = await prisma.address.findFirst({ where: { id: input.addressId, customerId, isDeleted: false } });
    if (!addr) throw notFound('Address');
    return {
      lat: addr.lat,
      lng: addr.lng,
      address: [addr.street, addr.suburb, addr.city].filter(Boolean).join(', ') || addr.city,
      landmark: addr.landmark,
    };
  }
  if (input.dropoff) {
    const d = input.dropoff;
    return {
      lat: d.lat,
      lng: d.lng,
      address: [d.street, d.suburb, d.city ?? 'Harare'].filter(Boolean).join(', '),
      landmark: d.landmark,
    };
  }
  throw badRequest('Choose a delivery address');
}

async function requireCustomer(userId: string) {
  const customer = await prisma.customer.findUnique({ where: { userId }, include: { user: true } });
  if (!customer) throw forbidden('Customer profile not found');
  return customer;
}

async function assertServiceable(point: LatLng, label: string) {
  const zone = await findZoneForPoint(point);
  if (!zone && (await zonesConfigured())) {
    throw badRequest(`Sorry, the ${label} is outside our delivery zones for now.`);
  }
  return zone;
}

// ───────────────────────────── Vendor orders ─────────────────────────────

export interface CartItemInput {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface VendorOrderInput extends DropoffInput {
  vendorId: string;
  items: CartItemInput[];
  tipCents: number;
  currency?: Currency;
}

async function buildVendorQuote(userId: string, input: VendorOrderInput) {
  const settings = await getSettings();
  const customer = await requireCustomer(userId);
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId }, include: { openingHours: true } });
  if (!vendor || vendor.status !== 'APPROVED') throw notFound('Store');
  if (!isVendorOpen(vendor)) throw badRequest(`${vendor.name} is closed right now.`);

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, vendorId: vendor.id, isDeleted: false },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const qtyByProduct = new Map<string, number>();
  for (const item of input.items) qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);

  const lines = input.items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw badRequest('Some items in your cart are no longer available. Please review your cart.');
    if (!product.isAvailable) throw badRequest(`${product.name} is currently unavailable.`);
    const totalQty = qtyByProduct.get(product.id)!;
    if (product.trackStock && product.stockQty < totalQty) {
      throw badRequest(
        product.stockQty > 0 ? `Only ${product.stockQty} × ${product.name} left in stock.` : `${product.name} is out of stock.`,
      );
    }
    return {
      productId: product.id,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity: item.quantity,
      lineTotalCents: product.priceCents * item.quantity,
      notes: item.notes,
      trackStock: product.trackStock,
    };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  if (subtotalCents < vendor.minOrderCents) {
    throw badRequest(`${vendor.name} has a minimum order of ${formatMoney(vendor.minOrderCents, 'USD')}.`);
  }
  if (input.tipCents > settings.maxTipCents) {
    throw badRequest(`Tips are limited to ${formatMoney(settings.maxTipCents, 'USD')}.`);
  }

  const dropoff = await resolveDropoff(customer.id, input);
  const zone = await assertServiceable(dropoff, 'delivery address');
  const route = await routeEstimate({ lat: vendor.lat, lng: vendor.lng }, dropoff);
  if (route.distanceKm > settings.maxDeliveryKm) {
    throw badRequest(`This address is ${route.distanceKm.toFixed(1)} km away — beyond ${vendor.name}'s delivery range.`);
  }

  const breakdown = buildBreakdown({
    subtotalCents,
    deliveryFeeCents: deliveryFeeCents(route.distanceKm, settings, zone),
    tipCents: input.tipCents,
    commissionRateBps: vendor.commissionRateBps ?? settings.commissionRateBps,
    riderEarningCents: riderPayCents(route.distanceKm, settings, zone),
  });
  const currency = input.currency ?? customer.user.preferredCurrency;
  const travel = route.durationMinutes ?? travelMinutes(route.distanceKm, settings.riderAvgSpeedKmh);

  return {
    customer,
    vendor,
    zone,
    dropoff,
    lines,
    breakdown,
    currency,
    exchangeRate: settings.zigPerUsd,
    distanceKm: route.distanceKm,
    etaMinutes: vendor.avgPrepMinutes + travel,
  };
}

function presentQuote(q: {
  breakdown: ReturnType<typeof buildBreakdown>;
  currency: Currency;
  exchangeRate: number;
  distanceKm: number;
  etaMinutes: number;
  lines?: Array<{ productId: string; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }>;
}) {
  const { breakdown: b, currency, exchangeRate } = q;
  return {
    lines: q.lines?.map(({ productId, name, unitPriceCents, quantity, lineTotalCents }) => ({
      productId,
      name,
      unitPriceCents,
      quantity,
      lineTotalCents,
    })),
    subtotalCents: b.subtotalCents,
    deliveryFeeCents: b.deliveryFeeCents,
    tipCents: b.tipCents,
    totalCents: b.totalCents,
    currency,
    exchangeRate,
    totalLocalCents: convertFromUsd(b.totalCents, currency, exchangeRate),
    distanceKm: q.distanceKm,
    etaMinutes: q.etaMinutes,
  };
}

export async function quoteVendorOrder(userId: string, input: VendorOrderInput) {
  return presentQuote(await buildVendorQuote(userId, input));
}

async function withUniqueCode<T>(fn: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(orderCode());
    } catch (err) {
      const target = err instanceof Prisma.PrismaClientKnownRequestError ? String(err.meta?.target ?? '') : '';
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && target.includes('code')) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a unique order code');
}

export async function createVendorOrder(
  user: AuthUser,
  input: VendorOrderInput & { paymentMethod: PaymentMethod; notes?: string },
) {
  const q = await buildVendorQuote(user.id, input);
  const isCash = input.paymentMethod === 'CASH';
  const now = new Date();

  const order = await withUniqueCode((code) =>
    prisma.$transaction(async (tx) => {
      // Reserve stock atomically; fails if another order took the last units.
      const reserve = new Map<string, { name: string; qty: number }>();
      for (const line of q.lines) {
        if (!line.trackStock) continue;
        const entry = reserve.get(line.productId) ?? { name: line.name, qty: 0 };
        entry.qty += line.quantity;
        reserve.set(line.productId, entry);
      }
      for (const [productId, { name, qty }] of reserve) {
        const res = await tx.product.updateMany({
          where: { id: productId, trackStock: true, stockQty: { gte: qty } },
          data: { stockQty: { decrement: qty } },
        });
        if (res.count === 0) throw conflict(`${name} just sold out. Please update your cart.`);
      }

      const created = await tx.order.create({
        data: {
          code,
          type: 'DELIVERY',
          status: isCash ? 'PLACED' : 'PENDING_PAYMENT',
          customerId: q.customer.id,
          vendorId: q.vendor.id,
          zoneId: q.zone?.id,
          pickupLat: q.vendor.lat,
          pickupLng: q.vendor.lng,
          pickupAddress: q.vendor.addressLine,
          pickupLandmark: q.vendor.landmark,
          pickupContactName: q.vendor.name,
          pickupContactPhone: q.vendor.phone,
          dropoffLat: q.dropoff.lat,
          dropoffLng: q.dropoff.lng,
          dropoffAddress: q.dropoff.address,
          dropoffLandmark: q.dropoff.landmark,
          recipientName: q.customer.user.name,
          recipientPhone: q.customer.user.phone,
          distanceKm: q.distanceKm,
          ...q.breakdown,
          currency: q.currency,
          exchangeRate: q.exchangeRate,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          deliveryPin: randomDigits(4),
          placedAt: isCash ? now : null,
          items: {
            create: q.lines.map((l) => ({
              productId: l.productId,
              name: l.name,
              unitPriceCents: l.unitPriceCents,
              quantity: l.quantity,
              lineTotalCents: l.lineTotalCents,
              notes: l.notes,
            })),
          },
          events: {
            create: {
              type: 'STATUS_CHANGED',
              status: isCash ? 'PLACED' : 'PENDING_PAYMENT',
              message: isCash ? 'Order placed (cash on delivery)' : 'Order created, awaiting payment',
              actorId: user.id,
            },
          },
        },
      });
      if (isCash) {
        await tx.payment.create({
          data: {
            orderId: created.id,
            method: 'CASH',
            currency: q.currency,
            amountCents: convertFromUsd(q.breakdown.totalCents, q.currency, q.exchangeRate),
            amountUsdCents: q.breakdown.totalCents,
            reference: `CASH-${code}`,
          },
        });
      }
      return created;
    }),
  );

  if (isCash) await onOrderPlaced(order.id);
  return order;
}

// ───────────────────────────── Parcel orders ─────────────────────────────

export interface ParcelOrderInput extends DropoffInput {
  pickup: { lat: number; lng: number; landmark: string; address: string; contactName?: string; contactPhone?: string };
  recipientName: string;
  recipientPhone: string;
  description: string;
  size: ParcelSize;
  tipCents: number;
  currency?: Currency;
}

async function buildParcelQuote(userId: string, input: ParcelOrderInput) {
  const settings = await getSettings();
  const customer = await requireCustomer(userId);
  const dropoff = await resolveDropoff(customer.id, input);
  const pickupZone = await assertServiceable(input.pickup, 'pickup point');
  await assertServiceable(dropoff, 'drop-off point');
  if (input.tipCents > settings.maxTipCents) {
    throw badRequest(`Tips are limited to ${formatMoney(settings.maxTipCents, 'USD')}.`);
  }
  const route = await routeEstimate(input.pickup, dropoff);
  if (route.distanceKm > settings.maxDeliveryKm) {
    throw badRequest(`Parcel deliveries are limited to ${settings.maxDeliveryKm} km.`);
  }
  const breakdown = buildBreakdown({
    subtotalCents: 0,
    deliveryFeeCents: deliveryFeeCents(route.distanceKm, settings, pickupZone) + parcelSurcharge(input.size, settings),
    tipCents: input.tipCents,
    commissionRateBps: 0,
    riderEarningCents: riderPayCents(route.distanceKm, settings, pickupZone),
  });
  const travel = route.durationMinutes ?? travelMinutes(route.distanceKm, settings.riderAvgSpeedKmh);
  return {
    customer,
    zone: pickupZone,
    dropoff,
    breakdown,
    currency: input.currency ?? customer.user.preferredCurrency,
    exchangeRate: settings.zigPerUsd,
    distanceKm: route.distanceKm,
    etaMinutes: 10 + travel, // allow ~10 min for a rider to reach the sender
  };
}

export async function quoteParcelOrder(userId: string, input: ParcelOrderInput) {
  return presentQuote(await buildParcelQuote(userId, input));
}

export async function createParcelOrder(user: AuthUser, input: ParcelOrderInput & { paymentMethod: PaymentMethod; notes?: string }) {
  const q = await buildParcelQuote(user.id, input);
  const isCash = input.paymentMethod === 'CASH';
  const now = new Date();

  const order = await withUniqueCode((code) =>
    prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          code,
          type: 'PARCEL',
          status: isCash ? 'PLACED' : 'PENDING_PAYMENT',
          customerId: q.customer.id,
          zoneId: q.zone?.id,
          pickupLat: input.pickup.lat,
          pickupLng: input.pickup.lng,
          pickupAddress: input.pickup.address,
          pickupLandmark: input.pickup.landmark,
          pickupContactName: input.pickup.contactName ?? q.customer.user.name,
          pickupContactPhone: input.pickup.contactPhone ?? q.customer.user.phone,
          dropoffLat: q.dropoff.lat,
          dropoffLng: q.dropoff.lng,
          dropoffAddress: q.dropoff.address,
          dropoffLandmark: q.dropoff.landmark,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          parcelDescription: input.description,
          parcelSize: input.size,
          distanceKm: q.distanceKm,
          ...q.breakdown,
          currency: q.currency,
          exchangeRate: q.exchangeRate,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          deliveryPin: randomDigits(4),
          placedAt: isCash ? now : null,
          events: {
            create: {
              type: 'STATUS_CHANGED',
              status: isCash ? 'PLACED' : 'PENDING_PAYMENT',
              message: isCash ? 'Parcel request placed (cash)' : 'Parcel request created, awaiting payment',
              actorId: user.id,
            },
          },
        },
      });
      if (isCash) {
        await tx.payment.create({
          data: {
            orderId: created.id,
            method: 'CASH',
            currency: q.currency,
            amountCents: convertFromUsd(q.breakdown.totalCents, q.currency, q.exchangeRate),
            amountUsdCents: q.breakdown.totalCents,
            reference: `CASH-${code}`,
          },
        });
      }
      return created;
    }),
  );

  if (isCash) await onOrderPlaced(order.id);
  return order;
}

// ───────────────────────────── State machine ─────────────────────────────

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'REJECTED', 'PICKED_UP', 'CANCELLED'],
  ACCEPTED: ['READY_FOR_PICKUP', 'PICKED_UP', 'CANCELLED'],
  READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['ON_THE_WAY', 'DELIVERED', 'CANCELLED'],
  ON_THE_WAY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

const TIMESTAMP_FIELD: Partial<Record<OrderStatus, keyof Prisma.OrderUncheckedUpdateManyInput>> = {
  PLACED: 'placedAt',
  ACCEPTED: 'acceptedAt',
  READY_FOR_PICKUP: 'readyAt',
  PICKED_UP: 'pickedUpAt',
  ON_THE_WAY: 'onTheWayAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
  REJECTED: 'cancelledAt',
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

interface TransitionOptions {
  actorId?: string;
  message?: string;
  data?: Prisma.OrderUncheckedUpdateManyInput;
  /** Extra guard: only allow when the current status is one of these. */
  from?: OrderStatus[];
}

/**
 * Moves an order to `to`, enforcing the state machine with optimistic
 * concurrency, and applies side effects (stock release, wallet postings, cash
 * collection, refunds). Notifications and dispatch run after commit.
 */
export async function transitionOrder(orderId: string, to: OrderStatus, opts: TransitionOptions = {}) {
  const now = new Date();
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
    if (!current) throw notFound('Order');
    if ((opts.from && !opts.from.includes(current.status)) || !canTransition(current.status, to)) {
      throw conflict(`This order is "${STATUS_LABELS[current.status]}" and can't be changed to "${STATUS_LABELS[to]}".`);
    }

    const stampField = TIMESTAMP_FIELD[to];
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { ...opts.data, status: to, ...(stampField ? { [stampField]: now } : {}) },
    });
    if (updated.count === 0) throw conflict('This order was just updated. Please refresh and try again.');

    await tx.orderEvent.create({
      data: { orderId, type: 'STATUS_CHANGED', status: to, message: opts.message ?? STATUS_LABELS[to], actorId: opts.actorId },
    });

    if (to === 'CANCELLED' || to === 'REJECTED') {
      // Return reserved stock.
      for (const item of current.items) {
        if (!item.productId) continue;
        await tx.product.updateMany({
          where: { id: item.productId, trackStock: true },
          data: { stockQty: { increment: item.quantity } },
        });
      }
      await tx.payment.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      // Paid online → queue a refund for admins to process.
      const paid = current.payments.filter((p) => p.status === 'PAID' && p.method !== 'CASH');
      for (const p of paid) {
        await tx.refund.create({
          data: {
            orderId,
            paymentId: p.id,
            amountCents: p.amountUsdCents,
            method: p.method,
            status: 'PENDING',
            notes: `Automatic refund: order ${to.toLowerCase()}`,
          },
        });
      }
      if (current.paymentStatus === 'PENDING') {
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'CANCELLED' } });
      }
    }

    if (to === 'DELIVERED') {
      if (!current.riderId) throw conflict('No rider assigned to this order.');
      const riderId = current.riderId;
      await postWalletEntry(tx, riderId, {
        type: 'DELIVERY_FEE',
        amountCents: current.riderEarningCents,
        description: `Delivery ${current.code} (${current.distanceKm.toFixed(1)} km)`,
        orderId,
      });
      if (current.tipCents > 0) {
        await postWalletEntry(tx, riderId, {
          type: 'TIP',
          amountCents: current.tipCents,
          description: `Tip on ${current.code}`,
          orderId,
        });
      }
      if (current.paymentMethod === 'CASH') {
        await tx.cashCollection.create({ data: { riderId, orderId, amountCents: current.totalCents } });
        await postWalletEntry(tx, riderId, {
          type: 'CASH_COLLECTED',
          amountCents: -current.totalCents,
          description: `Cash collected for ${current.code}`,
          orderId,
        });
        await tx.payment.updateMany({
          where: { orderId, method: 'CASH', status: 'PENDING' },
          data: { status: 'PAID', paidAt: now },
        });
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
      }
    }

    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true, rider: true, vendor: true } });
  });

  // ── After commit ──
  await publishOrderUpdate(orderId);
  const customerUserId = order.customer.userId;
  const code = order.code;

  switch (to) {
    case 'PLACED':
      await onOrderPlaced(orderId, false);
      break;
    case 'ACCEPTED':
      notifyAsync({
        userId: customerUserId,
        type: 'ORDER_ACCEPTED',
        title: 'Order accepted',
        body: `${order.vendor?.name ?? 'The store'} is preparing order ${code}${order.prepMinutes ? ` (~${order.prepMinutes} min)` : ''}.`,
        data: { orderId },
      });
      void startAutoDispatch(orderId);
      break;
    case 'READY_FOR_PICKUP':
      if (order.rider) {
        notifyAsync({
          userId: order.rider.userId,
          type: 'ORDER_READY',
          title: 'Order ready for pickup',
          body: `Order ${code} is ready at ${order.vendor?.name ?? 'the store'}.`,
          data: { orderId },
        });
      }
      break;
    case 'PICKED_UP':
      notifyAsync({
        userId: customerUserId,
        type: 'ORDER_PICKED_UP',
        title: 'Order picked up',
        body: `Your rider has collected order ${code}.`,
        data: { orderId },
      });
      break;
    case 'ON_THE_WAY':
      notifyAsync({
        userId: customerUserId,
        type: 'ORDER_ON_THE_WAY',
        title: 'Rider on the way 🛵',
        body: `Order ${code} is on its way. Your delivery PIN is ${order.deliveryPin}.`,
        data: { orderId },
        fallbackToSms: true,
      });
      break;
    case 'DELIVERED':
      notifyAsync({
        userId: customerUserId,
        type: 'ORDER_DELIVERED',
        title: 'Delivered! Enjoy 🎉',
        body: `Order ${code} was delivered. Tap to rate your experience.`,
        data: { orderId },
        fallbackToSms: true,
      });
      if (order.riderId) void checkAndAwardBonuses(order.riderId);
      break;
    case 'REJECTED':
      notifyAsync({
        userId: customerUserId,
        type: 'ORDER_REJECTED',
        title: 'Order not accepted',
        body: `${order.vendor?.name ?? 'The store'} couldn't take order ${code}${order.rejectReason ? `: ${order.rejectReason}` : '.'}${
          order.paymentStatus === 'PAID' && order.paymentMethod !== 'CASH' ? ' A refund is being processed.' : ''
        }`,
        data: { orderId },
        fallbackToSms: true,
      });
      await cancelOpenOffers(orderId);
      break;
    case 'CANCELLED':
      await cancelOpenOffers(orderId);
      notifyAsync({
        userId: customerUserId,
        type: 'ORDER_CANCELLED',
        title: 'Order cancelled',
        body: `Order ${code} was cancelled${order.cancelReason ? `: ${order.cancelReason}` : '.'}`,
        data: { orderId },
      });
      if (order.rider) {
        notifyAsync({
          userId: order.rider.userId,
          type: 'ORDER_CANCELLED',
          title: 'Delivery cancelled',
          body: `Order ${code} was cancelled. You're free for new requests.`,
          data: { orderId },
          fallbackToSms: true,
        });
      }
      break;
    default:
      break;
  }
  return order;
}

/** Runs once an order becomes PLACED (cash immediately; online after payment). */
async function onOrderPlaced(orderId: string, publish = true): Promise<void> {
  try {
    if (publish) await publishOrderUpdate(orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { vendor: true, items: true } });
    if (!order) return;
    if (order.type === 'PARCEL') {
      void startAutoDispatch(orderId);
      return;
    }
    if (order.vendor) {
      emitTo(rooms.vendor(order.vendor.id), ServerEvents.vendorNewOrder, { id: order.id, code: order.code });
      notifyAsync({
        userId: order.vendor.userId,
        type: 'VENDOR_NEW_ORDER',
        title: 'New order 🔔',
        body: `Order ${order.code}: ${order.items.reduce((s, i) => s + i.quantity, 0)} item(s), ${formatMoney(
          order.subtotalCents,
          'USD',
        )}. Accept it now.`,
        data: { orderId },
        fallbackToSms: true,
      });
    }
  } catch (err) {
    logger.error({ err, orderId }, 'onOrderPlaced failed');
  }
}

// ───────────────────────────── Access & queries ─────────────────────────────

/** Determines how `user` may view the order, or null if they can't. */
export function viewerFor(
  user: Pick<AuthUser, 'id' | 'roles'>,
  order: { customer: { userId: string }; vendor: { userId: string } | null; rider: { userId: string } | null },
): OrderViewer | null {
  if (order.customer.userId === user.id) return 'customer';
  if (order.rider?.userId === user.id) return 'rider';
  if (order.vendor?.userId === user.id) return 'vendor';
  if (user.roles.includes('ADMIN')) return 'admin';
  return null;
}

export async function getOrderForUser(user: AuthUser, orderId: string, as?: OrderViewer) {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: orderId }, { code: orderId }] },
    include: orderDetailInclude,
  });
  if (!order) throw notFound('Order');
  // Admin tools request the admin view explicitly (an admin may also be the customer).
  const viewer = as === 'admin' && user.roles.includes('ADMIN') ? 'admin' : viewerFor(user, order);
  if (!viewer) throw notFound('Order');
  return { order, viewer, presented: presentOrder(order, viewer) };
}

export async function listCustomerOrders(userId: string, page: number, pageSize: number, active?: boolean) {
  const customer = await requireCustomer(userId);
  const where: Prisma.OrderWhereInput = {
    customerId: customer.id,
    ...(active === true ? { status: { in: [...ACTIVE_STATUSES, 'PENDING_PAYMENT'] } } : {}),
    ...(active === false ? { status: { notIn: [...ACTIVE_STATUSES, 'PENDING_PAYMENT'] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: items.map((o) => presentOrder(o, 'customer')),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function cancelByCustomer(user: AuthUser, orderId: string, reason?: string) {
  const { order, viewer } = await getOrderForUser(user, orderId);
  if (viewer !== 'customer') throw forbidden();
  if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PLACED') {
    throw conflict('This order is already being prepared and can no longer be cancelled in the app. Please contact support.');
  }
  return transitionOrder(order.id, 'CANCELLED', {
    actorId: user.id,
    from: ['PENDING_PAYMENT', 'PLACED'],
    message: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer',
    data: { cancelReason: reason ?? 'Cancelled by customer' },
  });
}

/** Items from a past order that can be added to a new cart. */
export async function reorder(user: AuthUser, orderId: string) {
  const { order, viewer } = await getOrderForUser(user, orderId);
  if (viewer !== 'customer') throw forbidden();
  if (!order.vendorId) throw badRequest('Parcel orders cannot be reordered.');
  const productIds = order.items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, isDeleted: false } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const available: Array<{ productId: string; name: string; quantity: number; priceCents: number; priceChanged: boolean }> = [];
  const unavailable: string[] = [];
  for (const item of order.items) {
    const p = item.productId ? byId.get(item.productId) : undefined;
    if (!p || !p.isAvailable || (p.trackStock && p.stockQty <= 0)) {
      unavailable.push(item.name);
      continue;
    }
    available.push({
      productId: p.id,
      name: p.name,
      quantity: p.trackStock ? Math.min(item.quantity, p.stockQty) : item.quantity,
      priceCents: p.priceCents,
      priceChanged: p.priceCents !== item.unitPriceCents,
    });
  }
  return { vendorId: order.vendorId, vendorName: order.vendor?.name, items: available, unavailable };
}

/** Periodic job: cancels orders whose online payment never completed. */
export async function expireUnpaidOrders(): Promise<void> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.pendingPaymentTimeoutMinutes * 60_000);
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
    select: { id: true },
    take: 100,
  });
  for (const o of stale) {
    try {
      await transitionOrder(o.id, 'CANCELLED', {
        from: ['PENDING_PAYMENT'],
        message: 'Payment not completed in time',
        data: { cancelReason: 'Payment not completed in time' },
      });
    } catch (err) {
      logger.warn({ err, orderId: o.id }, 'Could not expire unpaid order');
    }
  }
}
