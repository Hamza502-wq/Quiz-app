import { Router } from 'express';
import { z } from 'zod';
import { defineRoute, idParams, latLng, paged, pagination } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { imageUrl, optionalTrimmed, trimmed, zwPlateSchema } from '../../lib/validation';
import { ensureRole } from '../auth/auth.service';
import { acceptOffer, declineOffer, getOfferPayload, riderReleaseOrder } from '../dispatch/dispatch.service';
import { orderInclude, presentOrder, ACTIVE_STATUSES } from '../orders/order.presenter';
import { getOrderForUser } from '../orders/order.service';
import { getWalletSummary } from '../wallet/wallet.service';
import {
  getRiderDashboard,
  markDelivered,
  markOnTheWay,
  markPickedUp,
  registerRider,
  requestRiderPayout,
  requireRider,
  setOnline,
  updateRiderLocation,
} from './rider.service';

export const riderRouter = Router();
const basePath = '/api/v1/rider';
const tags = ['Rider app'];
const roles = ['RIDER' as const];

defineRoute(riderRouter, {
  method: 'post',
  path: '/register',
  basePath,
  tags,
  summary: 'Submit rider registration (photo, ID, licence and bike details) for admin approval',
  description:
    'Upload the ID and licence via POST /uploads?kind=document and the profile photo via POST /uploads?kind=avatar, then pass the returned URLs. Number plates use the Zimbabwean format "ABC 1234".',
  auth: 'required',
  status: 201,
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      nationalId: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9]{2}[- ]?[0-9]{6,7}[- ]?[A-Z][- ]?[0-9]{2}$/, 'Enter a valid Zimbabwean ID number, e.g. 63-1234567 A 12'),
      idDocumentUrl: imageUrl,
      licenceNumber: trimmed(30),
      licenceDocumentUrl: imageUrl,
      licenceExpiry: z.coerce.date().optional(),
      vehicleType: z.enum(['MOTORBIKE', 'BICYCLE', 'CAR']),
      vehicleMake: optionalTrimmed(40),
      vehicleModel: optionalTrimmed(40),
      // Zimbabwean plate ("ABC 1234"): required for motorbikes and cars, not asked for bicycles.
      vehiclePlate: zwPlateSchema.optional(),
      vehicleColor: optionalTrimmed(20),
      vehiclePhotoUrl: imageUrl.optional(),
      // Profile photo shown to customers and admins; required unless the account already has one.
      photoUrl: imageUrl.optional(),
    })
    .superRefine((body, ctx) => {
      if (body.vehicleType !== 'BICYCLE' && !body.vehiclePlate) {
        ctx.addIssue({ code: 'custom', path: ['vehiclePlate'], message: 'Enter your number plate, e.g. AEZ 1234' });
      }
    })
    .transform((body) => (body.vehicleType === 'BICYCLE' ? { ...body, vehiclePlate: undefined } : body)),
  handler: async ({ body, user }) => {
    await ensureRole(prisma, user.id, 'RIDER');
    await registerRider(user.id, body);
    return getRiderDashboard(user.id);
  },
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/me',
  basePath,
  tags,
  summary: 'Rider home: profile, approval status, wallet, active order, pending offer, stats',
  auth: 'required',
  roles,
  handler: ({ user }) => getRiderDashboard(user.id),
});

defineRoute(riderRouter, {
  method: 'patch',
  path: '/me',
  basePath,
  tags,
  summary: 'Update payout details and vehicle colour',
  auth: 'required',
  roles,
  body: z.object({
    payoutMethod: z.enum(['ECOCASH', 'ONEMONEY', 'BANK']).optional(),
    payoutAccount: optionalTrimmed(40),
    payoutAccountName: optionalTrimmed(80),
    payoutBankName: optionalTrimmed(80),
    vehicleColor: optionalTrimmed(20),
  }),
  handler: async ({ body, user }) => {
    const rider = await requireRider(user.id);
    await prisma.rider.update({ where: { id: rider.id }, data: body });
    return getRiderDashboard(user.id);
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/status',
  basePath,
  tags,
  summary: 'Go online / offline',
  auth: 'required',
  roles,
  body: z.object({ online: z.boolean(), lat: latLng.lat.optional(), lng: latLng.lng.optional() }),
  handler: ({ body, user }) =>
    setOnline(user.id, body.online, body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined),
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/location',
  basePath,
  tags,
  summary: 'Report current location (REST fallback for the Socket.IO "rider:location" event)',
  auth: 'required',
  roles,
  body: z.object({
    ...latLng,
    heading: z.number().min(0).max(360).optional(),
    speed: z.number().min(0).max(100).optional(),
  }),
  handler: async ({ body, user }) => {
    const rider = await requireRider(user.id, { approved: true });
    await updateRiderLocation(rider.id, body);
    return { ok: true };
  },
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/offers/current',
  basePath,
  tags,
  summary: 'The delivery request currently offered to me (if any)',
  auth: 'required',
  roles,
  handler: async ({ user }) => {
    const rider = await requireRider(user.id, { approved: true });
    const offer = await prisma.dispatchOffer.findFirst({
      where: { riderId: rider.id, status: 'OFFERED', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return { offer: offer ? await getOfferPayload(offer.id) : null };
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/offers/:id/accept',
  basePath,
  tags,
  summary: 'Accept a delivery request',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    const rider = await requireRider(user.id, { approved: true });
    const { orderId } = await acceptOffer(rider.id, params.id);
    return (await getOrderForUser(user, orderId)).presented;
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/offers/:id/decline',
  basePath,
  tags,
  summary: 'Decline a delivery request',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    const rider = await requireRider(user.id, { approved: true });
    return declineOffer(rider.id, params.id);
  },
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/orders/active',
  basePath,
  tags,
  summary: 'My active delivery',
  auth: 'required',
  roles,
  handler: async ({ user }) => {
    const rider = await requireRider(user.id);
    const order = await prisma.order.findFirst({
      where: { riderId: rider.id, status: { in: ACTIVE_STATUSES } },
      include: orderInclude,
    });
    return { order: order ? presentOrder(order, 'rider') : null };
  },
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/orders',
  basePath,
  tags,
  summary: 'My delivery history',
  auth: 'required',
  roles,
  query: pagination,
  handler: async ({ query, user }) => {
    const rider = await requireRider(user.id);
    const where = { riderId: rider.id, status: { in: ['DELIVERED' as const, 'CANCELLED' as const] } };
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    return paged(items.map((o) => presentOrder(o, 'rider')), total, query.page, query.pageSize);
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/orders/:id/decline',
  basePath,
  tags,
  summary: 'Hand back an assigned order before pickup',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ reason: optionalTrimmed(200) }),
  handler: async ({ params, body, user }) => {
    const rider = await requireRider(user.id, { approved: true });
    return riderReleaseOrder(rider.id, params.id, body.reason);
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/orders/:id/picked-up',
  basePath,
  tags,
  summary: 'Mark order as picked up',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    await markPickedUp(user.id, params.id);
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/orders/:id/on-the-way',
  basePath,
  tags,
  summary: 'Mark order as on the way to the customer',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    await markOnTheWay(user.id, params.id);
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/orders/:id/deliver',
  basePath,
  tags,
  summary: 'Complete delivery with proof (customer PIN or photo)',
  description: 'For PHOTO, upload first via POST /uploads?kind=proof. Cash orders record the cash collected against your wallet.',
  auth: 'required',
  roles,
  params: idParams,
  body: z.discriminatedUnion('proofType', [
    z.object({ proofType: z.literal('PIN'), pin: z.string().regex(/^\d{4}$/, 'Enter the 4-digit PIN') }),
    z.object({ proofType: z.literal('PHOTO'), photoUrl: imageUrl }),
  ]),
  handler: async ({ params, body, user }) => {
    await markDelivered(user.id, params.id, body);
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/wallet',
  basePath,
  tags,
  summary: 'Wallet: balance, cash owed, cash limit',
  auth: 'required',
  roles,
  handler: async ({ user }) => getWalletSummary((await requireRider(user.id)).id),
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/wallet/transactions',
  basePath,
  tags,
  summary: 'Wallet ledger (earnings, tips, bonuses, cash collected, payouts)',
  auth: 'required',
  roles,
  query: pagination,
  handler: async ({ query, user }) => {
    const rider = await requireRider(user.id);
    const where = { wallet: { riderId: rider.id } };
    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { order: { select: { code: true } } },
      }),
      prisma.walletTransaction.count({ where }),
    ]);
    return paged(
      items.map((t) => ({
        id: t.id,
        type: t.type,
        amountCents: t.amountCents,
        balanceAfterCents: t.balanceAfterCents,
        description: t.description,
        orderCode: t.order?.code ?? null,
        createdAt: t.createdAt,
      })),
      total,
      query.page,
      query.pageSize,
    );
  },
});

defineRoute(riderRouter, {
  method: 'get',
  path: '/payouts',
  basePath,
  tags,
  summary: 'My payout history',
  auth: 'required',
  roles,
  query: pagination,
  handler: async ({ query, user }) => {
    const rider = await requireRider(user.id);
    const where = { riderId: rider.id, payeeType: 'RIDER' as const };
    const [items, total] = await Promise.all([
      prisma.payout.findMany({ where, orderBy: { requestedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.payout.count({ where }),
    ]);
    return paged(items, total, query.page, query.pageSize);
  },
});

defineRoute(riderRouter, {
  method: 'post',
  path: '/payouts',
  basePath,
  tags,
  summary: 'Request a payout to EcoCash, OneMoney or bank (weekly by default)',
  auth: 'required',
  roles,
  status: 201,
  body: z.object({
    amountCents: z.number().int().min(1).optional(),
    method: z.enum(['ECOCASH', 'ONEMONEY', 'BANK']).optional(),
    accountNumber: optionalTrimmed(40),
    accountName: optionalTrimmed(80),
    bankName: optionalTrimmed(80),
  }),
  handler: ({ body, user }) => requestRiderPayout(user.id, body),
});
