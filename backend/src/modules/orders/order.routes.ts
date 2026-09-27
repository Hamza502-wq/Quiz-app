import { Router } from 'express';
import { z } from 'zod';
import { defineRoute, idParams, latLng, pagination, queryBool } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { conflict } from '../../lib/errors';
import { optionalTrimmed, phoneSchema, trimmed } from '../../lib/validation';
import { getSettings } from '../settings/settings.service';
import { assertOnlinePaymentsAvailable, payForOrder, tipRider } from '../payments/payment.service';
import { rateOrder } from '../ratings/rating.service';
import { listMessages, sendMessage } from '../chat/chat.service';
import { notifyAdmins } from '../notifications/notification.service';
import {
  cancelByCustomer,
  createParcelOrder,
  createVendorOrder,
  getOrderForUser,
  listCustomerOrders,
  quoteParcelOrder,
  quoteVendorOrder,
  reorder,
} from './order.service';
import { estimateEtaMinutes } from './tracking.service';

export const orderRouter = Router();
const basePath = '/api/v1/orders';
const tags = ['Orders'];

const dropoffFields = {
  addressId: z.string().max(64).optional(),
  dropoff: z
    .object({
      ...latLng,
      landmark: trimmed(200),
      street: optionalTrimmed(120),
      suburb: optionalTrimmed(80),
      city: optionalTrimmed(60),
    })
    .optional(),
};

const requireDropoff = <T extends { addressId?: string; dropoff?: unknown }>(v: T) => Boolean(v.addressId || v.dropoff);
const dropoffMessage = { message: 'Choose a delivery address', path: ['addressId'] };

const vendorOrderBase = z.object({
  vendorId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(99),
        notes: optionalTrimmed(200),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(50),
  tipCents: z.number().int().min(0).default(0),
  currency: z.enum(['USD', 'ZWG']).optional(),
  ...dropoffFields,
});

const paymentFields = {
  paymentMethod: z.enum(['ECOCASH', 'ONEMONEY', 'CARD', 'CASH']),
  /** Mobile-money number to charge; defaults to the account phone. */
  payerPhone: phoneSchema.optional(),
  notes: optionalTrimmed(300),
};

const parcelBase = z.object({
  pickup: z.object({
    ...latLng,
    address: trimmed(160),
    landmark: trimmed(200),
    contactName: optionalTrimmed(80),
    contactPhone: phoneSchema.optional(),
  }),
  recipientName: trimmed(80),
  recipientPhone: phoneSchema,
  description: trimmed(200),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE']),
  tipCents: z.number().int().min(0).default(0),
  currency: z.enum(['USD', 'ZWG']).optional(),
  ...dropoffFields,
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/quote',
  basePath,
  tags,
  summary: 'Price a cart: subtotal, delivery fee, tip, total (USD & ZiG), ETA',
  auth: 'required',
  roles: ['CUSTOMER'],
  body: vendorOrderBase.refine(requireDropoff, dropoffMessage),
  handler: ({ body, user }) => quoteVendorOrder(user.id, body),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/',
  basePath,
  tags,
  summary: 'Place a vendor order',
  description:
    'Cash orders are placed immediately. For ECOCASH/ONEMONEY a Paynow USSD prompt is sent to `payerPhone`; for CARD a `payment.redirectUrl` is returned. Poll GET /payments/{id} until PAID.',
  auth: 'required',
  roles: ['CUSTOMER'],
  status: 201,
  body: vendorOrderBase.extend(paymentFields).refine(requireDropoff, dropoffMessage),
  handler: async ({ body, user }) => {
    const currency =
      body.currency ?? (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).preferredCurrency;
    if (body.paymentMethod !== 'CASH') assertOnlinePaymentsAvailable(currency);
    const order = await createVendorOrder(user, { ...body, currency });
    return finishCheckout(user, order.id, body.paymentMethod, body.payerPhone);
  },
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/parcel/quote',
  basePath,
  tags,
  summary: 'Price a parcel delivery',
  auth: 'required',
  roles: ['CUSTOMER'],
  body: parcelBase.refine(requireDropoff, dropoffMessage),
  handler: ({ body, user }) => quoteParcelOrder(user.id, body),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/parcel',
  basePath,
  tags,
  summary: 'Request a parcel pickup and delivery',
  auth: 'required',
  roles: ['CUSTOMER'],
  status: 201,
  body: parcelBase.extend(paymentFields).refine(requireDropoff, dropoffMessage),
  handler: async ({ body, user }) => {
    const currency =
      body.currency ?? (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).preferredCurrency;
    if (body.paymentMethod !== 'CASH') assertOnlinePaymentsAvailable(currency);
    const order = await createParcelOrder(user, { ...body, currency });
    return finishCheckout(user, order.id, body.paymentMethod, body.payerPhone);
  },
});

async function finishCheckout(
  user: Parameters<typeof getOrderForUser>[0],
  orderId: string,
  method: 'ECOCASH' | 'ONEMONEY' | 'CARD' | 'CASH',
  payerPhone?: string,
) {
  let payment = null;
  let paymentError: string | null = null;
  if (method !== 'CASH') {
    try {
      payment = await payForOrder(user, orderId, method, payerPhone);
    } catch (err) {
      paymentError = err instanceof Error ? err.message : 'Payment could not be started';
    }
  }
  const { presented } = await getOrderForUser(user, orderId);
  return { order: presented, payment, paymentError };
}

defineRoute(orderRouter, {
  method: 'get',
  path: '/',
  basePath,
  tags,
  summary: 'My orders (customer order history)',
  auth: 'required',
  roles: ['CUSTOMER'],
  query: pagination.extend({ active: queryBool.optional() }),
  handler: ({ query, user }) => listCustomerOrders(user.id, query.page, query.pageSize, query.active),
});

defineRoute(orderRouter, {
  method: 'get',
  path: '/:id',
  basePath,
  tags,
  summary: 'Order details (customer, vendor, rider or admin view)',
  auth: 'required',
  params: idParams,
  handler: async ({ params, user }) => (await getOrderForUser(user, params.id)).presented,
});

defineRoute(orderRouter, {
  method: 'get',
  path: '/:id/tracking',
  basePath,
  tags,
  summary: 'Live tracking snapshot: status, rider location and ETA',
  description: 'Use Socket.IO (`order:rider_location`) for live updates; this endpoint is the low-data polling fallback.',
  auth: 'required',
  params: idParams,
  handler: async ({ params, user }) => {
    const { order, viewer } = await getOrderForUser(user, params.id);
    const settings = await getSettings();
    const riderLoc =
      order.rider && order.rider.lat !== null && order.rider.lng !== null ? { lat: order.rider.lat, lng: order.rider.lng } : null;
    return {
      orderId: order.id,
      status: order.status,
      rider:
        order.rider && viewer !== 'vendor'
          ? {
              name: order.rider.user.name,
              vehiclePlate: order.rider.vehiclePlate,
              location: riderLoc ? { ...riderLoc, heading: order.rider.heading, updatedAt: order.rider.locationUpdatedAt } : null,
            }
          : null,
      etaMinutes: estimateEtaMinutes(order, riderLoc, settings),
      pickup: { lat: order.pickupLat, lng: order.pickupLng },
      dropoff: { lat: order.dropoffLat, lng: order.dropoffLng },
      updatedAt: order.updatedAt,
    };
  },
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/cancel',
  basePath,
  tags,
  summary: 'Cancel an order before the store accepts it',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  body: z.object({ reason: optionalTrimmed(200) }),
  handler: async ({ params, body, user }) => {
    await cancelByCustomer(user, params.id, body.reason);
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/pay',
  basePath,
  tags,
  summary: 'Start or retry online payment for an order awaiting payment',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  body: z.object({ method: z.enum(['ECOCASH', 'ONEMONEY', 'CARD']), payerPhone: phoneSchema.optional() }),
  handler: ({ params, body, user }) => payForOrder(user, params.id, body.method, body.payerPhone),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/reorder',
  basePath,
  tags,
  summary: 'Get the still-available items of a past order to refill the cart',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  handler: ({ params, user }) => reorder(user, params.id),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/rate',
  basePath,
  tags,
  summary: 'Rate and review the store and rider',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  body: z.object({
    vendorScore: z.number().int().min(1).max(5).optional(),
    vendorComment: optionalTrimmed(500),
    riderScore: z.number().int().min(1).max(5).optional(),
    riderComment: optionalTrimmed(500),
  }),
  handler: ({ params, body, user }) => rateOrder(user.id, params.id, body),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/tip',
  basePath,
  tags,
  summary: 'Tip the rider after delivery (EcoCash, OneMoney or card via Paynow)',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  body: z.object({
    amountCents: z.number().int().min(50).max(100_000),
    method: z.enum(['ECOCASH', 'ONEMONEY', 'CARD']),
    payerPhone: phoneSchema.optional(),
  }),
  handler: ({ params, body, user }) => tipRider(user, params.id, body.amountCents, body.method, body.payerPhone),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/dispute',
  basePath,
  tags,
  summary: 'Report a problem with an order',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  status: 201,
  body: z.object({
    reason: z.enum(['MISSING_ITEMS', 'WRONG_ORDER', 'DAMAGED', 'LATE', 'NOT_DELIVERED', 'OVERCHARGED', 'RIDER_CONDUCT', 'OTHER']),
    description: trimmed(1000),
  }),
  handler: async ({ params, body, user }) => {
    const { order, viewer } = await getOrderForUser(user, params.id);
    if (viewer !== 'customer') throw conflict('Only the customer can report a problem on this order.');
    if (order.status === 'PENDING_PAYMENT') throw conflict('This order has not been placed yet.');
    if (order.dispute) throw conflict('A problem has already been reported for this order.');
    const dispute = await prisma.dispute.create({
      data: { orderId: order.id, raisedById: user.id, reason: body.reason, description: body.description },
    });
    void notifyAdmins({
      type: 'DISPUTE_OPENED',
      title: 'New dispute',
      body: `Order ${order.code}: ${body.reason.replace(/_/g, ' ').toLowerCase()}`,
      data: { orderId: order.id, disputeId: dispute.id },
    });
    return dispute;
  },
});

defineRoute(orderRouter, {
  method: 'get',
  path: '/:id/messages',
  basePath,
  tags,
  summary: 'Chat messages between customer and rider',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => listMessages(user, params.id),
});

defineRoute(orderRouter, {
  method: 'post',
  path: '/:id/messages',
  basePath,
  tags,
  summary: 'Send a chat message to the customer / rider',
  auth: 'required',
  params: idParams,
  status: 201,
  body: z.object({ body: trimmed(1000) }),
  handler: ({ params, body, user }) => sendMessage(user, params.id, body.body),
});
