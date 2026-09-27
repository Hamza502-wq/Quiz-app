import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { defineRoute, idParams, latLng, paged, pagination, queryBool } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { isValidPolygon } from '../../lib/geo';
import { formatMoney } from '../../lib/money';
import { optionalTrimmed, passwordSchema, phoneSchema, trimmed } from '../../lib/validation';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { ensureRole, hashPassword } from '../auth/auth.service';
import { notifyAsync } from '../notifications/notification.service';
import { getSettings, settingsUpdateSchema, updateSettings } from '../settings/settings.service';
import {
  adminUnassign,
  findCandidates,
  manualAssign,
  offerToNextRider,
} from '../dispatch/dispatch.service';
import { ACTIVE_STATUSES, orderInclude, presentOrder } from '../orders/order.presenter';
import { getOrderForUser, transitionOrder } from '../orders/order.service';
import { getWalletSummary, postWalletEntry } from '../wallet/wallet.service';
import { runWeeklyRiderPayouts } from '../riders/rider.service';
import { vendorBalance, vendorStatement } from '../vendors/vendor-reports.service';
import { analytics, dashboardSummary } from './analytics.service';
import {
  completeRefund,
  createVendorPayout,
  generateVendorPayouts,
  processPayout,
  syncPaymentRefundStatus,
} from './payout-admin.service';

export const adminRouter = Router();
const basePath = '/api/v1/admin';
const roles = ['ADMIN' as const];

const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
function resolveRange(q: { from?: Date; to?: Date }) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
  if (from > to) throw badRequest('"from" must be before "to"');
  return { from, to };
}

// ───────────────────────────── Dashboard & analytics ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/dashboard',
  basePath,
  tags: ['Admin: analytics'],
  summary: 'Headline numbers (today, live, pending approvals)',
  auth: 'required',
  roles,
  handler: () => dashboardSummary(),
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/analytics',
  basePath,
  tags: ['Admin: analytics'],
  summary: 'Orders, revenue, active users and rider performance for a date range',
  auth: 'required',
  roles,
  query: rangeQuery,
  handler: ({ query }) => {
    const { from, to } = resolveRange(query);
    return analytics(from, to);
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/live',
  basePath,
  tags: ['Admin: dispatch'],
  summary: 'Live map data: active orders and online riders',
  auth: 'required',
  roles,
  handler: async () => {
    const settings = await getSettings();
    const [orders, riders] = await Promise.all([
      prisma.order.findMany({
        where: { status: { in: ACTIVE_STATUSES } },
        include: orderInclude,
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      prisma.rider.findMany({
        where: { status: 'APPROVED', isOnline: true },
        include: { user: { select: { name: true, phone: true } } },
      }),
    ]);
    const busy = new Map(orders.filter((o) => o.riderId).map((o) => [o.riderId!, o.id]));
    const staleBefore = Date.now() - settings.riderLocationStaleMinutes * 60_000;
    return {
      orders: orders.map((o) => presentOrder(o, 'admin')),
      riders: riders.map((r) => ({
        id: r.id,
        name: r.user.name,
        phone: r.user.phone,
        vehicleType: r.vehicleType,
        vehiclePlate: r.vehiclePlate,
        lat: r.lat,
        lng: r.lng,
        heading: r.heading,
        locationUpdatedAt: r.locationUpdatedAt,
        isStale: !r.locationUpdatedAt || r.locationUpdatedAt.getTime() < staleBefore,
        activeOrderId: busy.get(r.id) ?? null,
      })),
    };
  },
});

// ───────────────────────────── Orders & dispatch ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/orders',
  basePath,
  tags: ['Admin: orders'],
  summary: 'Search orders',
  auth: 'required',
  roles,
  query: pagination.extend({
    status: z.string().max(40).optional(),
    q: z.string().trim().max(60).optional(),
    vendorId: z.string().max(64).optional(),
    riderId: z.string().max(64).optional(),
    unassigned: queryBool.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
  handler: async ({ query }) => {
    const statuses = query.status === 'active' ? ACTIVE_STATUSES : query.status?.split(',').filter(Boolean);
    const where: Prisma.OrderWhereInput = {
      ...(statuses?.length ? { status: { in: statuses as Prisma.EnumOrderStatusFilter['in'] } } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(query.riderId ? { riderId: query.riderId } : {}),
      ...(query.unassigned ? { riderId: null } : {}),
      ...(query.from || query.to ? { createdAt: { gte: query.from, lte: query.to } } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q.toUpperCase() } },
              { customer: { user: { phone: { contains: query.q.replace(/\s/g, '') } } } },
              { customer: { user: { name: { contains: query.q, mode: 'insensitive' } } } },
              { vendor: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
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
    return paged(items.map((o) => presentOrder(o, 'admin')), total, query.page, query.pageSize);
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/orders/:id',
  basePath,
  tags: ['Admin: orders'],
  summary: 'Order details with timeline, dispatch offers, payments and refunds',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    const { order, presented } = await getOrderForUser(user, params.id, 'admin');
    const [offers, payments, refunds] = await Promise.all([
      prisma.dispatchOffer.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
        include: { rider: { select: { id: true, user: { select: { name: true } } } } },
      }),
      prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } }),
      prisma.refund.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      ...presented,
      offers: offers.map((o) => ({
        id: o.id,
        riderId: o.riderId,
        riderName: o.rider.user.name,
        status: o.status,
        isManual: o.isManual,
        distanceKm: o.distanceKm,
        createdAt: o.createdAt,
        respondedAt: o.respondedAt,
      })),
      paymentsAll: payments,
      refunds,
    };
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/orders/:id/candidates',
  basePath,
  tags: ['Admin: dispatch'],
  summary: 'Online riders nearest to the pickup point (for manual assignment)',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params }) => {
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) throw notFound('Order');
    return findCandidates(order, { enforceRadius: false, requireCashCapacity: false });
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/orders/:id/assign',
  basePath,
  tags: ['Admin: dispatch'],
  summary: 'Manually assign a rider',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ riderId: z.string().min(1).max(64) }),
  handler: async ({ params, body, user }) => {
    await manualAssign(params.id, body.riderId, user.id);
    return (await getOrderForUser(user, params.id, 'admin')).presented;
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/orders/:id/unassign',
  basePath,
  tags: ['Admin: dispatch'],
  summary: 'Remove the assigned rider (before pickup)',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    await adminUnassign(params.id, user.id);
    return (await getOrderForUser(user, params.id, 'admin')).presented;
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/orders/:id/auto-assign',
  basePath,
  tags: ['Admin: dispatch'],
  summary: 'Offer the order to the nearest available rider now',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params }) => {
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) throw notFound('Order');
    if (order.riderId) throw conflict('A rider is already assigned.');
    const offerId = await offerToNextRider(params.id);
    return { offered: Boolean(offerId), offerId, message: offerId ? 'Offer sent to the nearest rider' : 'No eligible riders nearby right now' };
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/orders/:id/cancel',
  basePath,
  tags: ['Admin: orders'],
  summary: 'Cancel an order (paid orders get a pending refund)',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ reason: trimmed(200) }),
  handler: async ({ params, body, user }) => {
    await transitionOrder(params.id, 'CANCELLED', {
      actorId: user.id,
      message: `Cancelled by admin: ${body.reason}`,
      data: { cancelReason: body.reason },
    });
    return (await getOrderForUser(user, params.id, 'admin')).presented;
  },
});

// ───────────────────────────── Vendors ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/vendors',
  basePath,
  tags: ['Admin: vendors'],
  summary: 'List vendors',
  auth: 'required',
  roles,
  query: pagination.extend({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
    q: z.string().trim().max(60).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.VendorWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: {
          category: { select: { name: true, slug: true } },
          zone: { select: { id: true, name: true } },
          user: { select: { name: true, phone: true, status: true } },
          _count: { select: { orders: true, products: { where: { isDeleted: false } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.vendor.count({ where }),
    ]);
    return paged(items, total, query.page, query.pageSize);
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/vendors/:id',
  basePath,
  tags: ['Admin: vendors'],
  summary: 'Vendor details with balance and hours',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params }) => {
    const vendor = await prisma.vendor.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        zone: true,
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        user: { select: { id: true, name: true, phone: true, status: true, createdAt: true } },
        _count: { select: { orders: true, products: { where: { isDeleted: false } } } },
      },
    });
    if (!vendor) throw notFound('Vendor');
    return { ...vendor, balance: await vendorBalance(vendor.id) };
  },
});

defineRoute(adminRouter, {
  method: 'patch',
  path: '/vendors/:id',
  basePath,
  tags: ['Admin: vendors'],
  summary: 'Approve / reject / suspend a vendor, set commission override and zone',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
    commissionRateBps: z.number().int().min(0).max(10_000).nullable().optional(),
    zoneId: z.string().max(64).nullable().optional(),
    reason: optionalTrimmed(200),
  }),
  handler: async ({ params, body }) => {
    const vendor = await prisma.vendor.findUnique({ where: { id: params.id } });
    if (!vendor) throw notFound('Vendor');
    const { reason, ...data } = body;
    const updated = await prisma.vendor.update({ where: { id: vendor.id }, data });
    if (body.status && body.status !== vendor.status) {
      const messages: Record<string, string> = {
        APPROVED: `Great news! ${vendor.name} is approved and live on DoorStep.`,
        REJECTED: `${vendor.name} was not approved${reason ? `: ${reason}` : '.'}`,
        SUSPENDED: `${vendor.name} has been suspended${reason ? `: ${reason}` : '.'} Contact support.`,
        PENDING: `${vendor.name} is under review again.`,
      };
      notifyAsync({
        userId: vendor.userId,
        type: `VENDOR_${body.status}`,
        title: 'Store status updated',
        body: messages[body.status],
        fallbackToSms: true,
      });
    }
    return updated;
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/vendors/:id/statement',
  basePath,
  tags: ['Admin: vendors'],
  summary: 'Vendor commission statement',
  auth: 'required',
  roles,
  params: idParams,
  query: rangeQuery,
  handler: ({ params, query }) => {
    const { from, to } = resolveRange(query);
    return vendorStatement(params.id, from, to);
  },
});

// ───────────────────────────── Riders ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/riders',
  basePath,
  tags: ['Admin: riders'],
  summary: 'List riders',
  auth: 'required',
  roles,
  query: pagination.extend({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
    online: queryBool.optional(),
    q: z.string().trim().max(60).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.RiderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.online !== undefined ? { isOnline: query.online } : {}),
      ...(query.q
        ? {
            OR: [
              { vehiclePlate: { contains: query.q.toUpperCase() } },
              { user: { name: { contains: query.q, mode: 'insensitive' } } },
              { user: { phone: { contains: query.q.replace(/\s/g, '') } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.rider.findMany({
        where,
        include: {
          user: { select: { name: true, phone: true, status: true } },
          wallet: { select: { balanceCents: true } },
          zone: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.rider.count({ where }),
    ]);
    return paged(
      items.map((r) => ({ ...r, cashOwedCents: Math.max(0, -(r.wallet?.balanceCents ?? 0)) })),
      total,
      query.page,
      query.pageSize,
    );
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/riders/:id',
  basePath,
  tags: ['Admin: riders'],
  summary: 'Rider details: documents, wallet, cash collections, recent deliveries',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params }) => {
    const rider = await prisma.rider.findUnique({
      where: { id: params.id },
      include: { user: { select: { id: true, name: true, phone: true, status: true, createdAt: true } }, zone: true },
    });
    if (!rider) throw notFound('Rider');
    const [wallet, cashCollections, transactions, deliveries] = await Promise.all([
      getWalletSummary(rider.id),
      prisma.cashCollection.findMany({
        where: { riderId: rider.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { order: { select: { code: true } } },
      }),
      prisma.walletTransaction.findMany({ where: { wallet: { riderId: rider.id } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.order.count({ where: { riderId: rider.id, status: 'DELIVERED' } }),
    ]);
    return { ...rider, wallet, cashCollections, transactions, deliveries };
  },
});

defineRoute(adminRouter, {
  method: 'patch',
  path: '/riders/:id',
  basePath,
  tags: ['Admin: riders'],
  summary: 'Approve / reject / suspend a rider; set cash limit and zone',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
    cashLimitCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
    zoneId: z.string().max(64).nullable().optional(),
    reason: optionalTrimmed(200),
  }),
  handler: async ({ params, body }) => {
    const rider = await prisma.rider.findUnique({ where: { id: params.id } });
    if (!rider) throw notFound('Rider');
    const { reason, ...data } = body;
    const statusChanged = body.status && body.status !== rider.status;
    const updated = await prisma.rider.update({
      where: { id: rider.id },
      data: {
        ...data,
        ...(body.status === 'APPROVED' && statusChanged ? { approvedAt: new Date(), rejectionReason: null } : {}),
        ...(body.status === 'REJECTED' ? { rejectionReason: reason ?? 'Documents could not be verified' } : {}),
        ...(body.status && body.status !== 'APPROVED' ? { isOnline: false } : {}),
      },
    });
    if (statusChanged) {
      const messages: Record<string, string> = {
        APPROVED: "You're approved! Open the DoorStep Rider app and go online to start earning.",
        REJECTED: `Your rider application was not approved${reason ? `: ${reason}` : '.'} You can update your details and resubmit.`,
        SUSPENDED: `Your rider account has been suspended${reason ? `: ${reason}` : '.'} Contact support.`,
        PENDING: 'Your rider application is under review again.',
      };
      notifyAsync({
        userId: rider.userId,
        type: `RIDER_${body.status}`,
        title: 'Rider account update',
        body: messages[body.status!],
        fallbackToSms: true,
      });
      emitTo(rooms.admins, ServerEvents.riderStatus, { riderId: rider.id, isOnline: updated.isOnline });
    }
    return updated;
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/riders/:id/cash-remittance',
  basePath,
  tags: ['Admin: riders'],
  summary: 'Record cash handed over by a rider (reduces cash owed)',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ amountCents: z.number().int().min(1).max(10_000_000), reference: trimmed(80) }),
  handler: async ({ params, body, user }) => {
    const rider = await prisma.rider.findUnique({ where: { id: params.id } });
    if (!rider) throw notFound('Rider');
    const summary = await getWalletSummary(rider.id);
    if (body.amountCents > summary.cashOwedCents) {
      throw badRequest(`Rider only owes ${formatMoney(summary.cashOwedCents, 'USD')}.`);
    }
    await prisma.$transaction((tx) =>
      postWalletEntry(tx, rider.id, {
        type: 'CASH_REMITTED',
        amountCents: body.amountCents,
        description: `Cash remitted (ref ${body.reference})`,
        createdById: user.id,
      }),
    );
    notifyAsync({
      userId: rider.userId,
      type: 'CASH_REMITTED',
      title: 'Cash remittance recorded',
      body: `We received ${formatMoney(body.amountCents, 'USD')} (ref ${body.reference}). Thank you!`,
    });
    return getWalletSummary(rider.id);
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/riders/:id/wallet-adjustment',
  basePath,
  tags: ['Admin: riders'],
  summary: 'Credit a bonus or post a manual adjustment to a rider wallet',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({
    type: z.enum(['BONUS', 'ADJUSTMENT']),
    amountCents: z
      .number()
      .int()
      .min(-10_000_000)
      .max(10_000_000)
      .refine((v) => v !== 0, 'Amount cannot be zero'),
    description: trimmed(160),
  }),
  handler: async ({ params, body, user }) => {
    const rider = await prisma.rider.findUnique({ where: { id: params.id } });
    if (!rider) throw notFound('Rider');
    if (body.type === 'BONUS' && body.amountCents < 0) throw badRequest('A bonus must be positive.');
    await prisma.$transaction((tx) =>
      postWalletEntry(tx, rider.id, { ...body, createdById: user.id }),
    );
    if (body.amountCents > 0) {
      notifyAsync({
        userId: rider.userId,
        type: body.type === 'BONUS' ? 'BONUS_AWARDED' : 'WALLET_ADJUSTED',
        title: body.type === 'BONUS' ? 'Bonus received 🎉' : 'Wallet credited',
        body: `${formatMoney(body.amountCents, 'USD')}: ${body.description}`,
      });
    }
    return getWalletSummary(rider.id);
  },
});

// ───────────────────────────── Users ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/users',
  basePath,
  tags: ['Admin: users'],
  summary: 'List users (customers, riders, vendors, admins)',
  auth: 'required',
  roles,
  query: pagination.extend({
    role: z.enum(['CUSTOMER', 'RIDER', 'VENDOR', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    q: z.string().trim().max(60).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { roles: { some: { role: { name: query.role } } } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q.replace(/\s/g, '') } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          status: true,
          lastSeenAt: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
          customer: { select: { id: true, _count: { select: { orders: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return paged(
      items.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name), orderCount: u.customer?._count.orders ?? 0 })),
      total,
      query.page,
      query.pageSize,
    );
  },
});

defineRoute(adminRouter, {
  method: 'patch',
  path: '/users/:id',
  basePath,
  tags: ['Admin: users'],
  summary: 'Suspend or reactivate a user account',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }),
  handler: async ({ params, body, user }) => {
    if (params.id === user.id) throw badRequest("You can't change your own account status.");
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) throw notFound('User');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { status: body.status } });
      if (body.status === 'SUSPENDED') {
        await tx.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.rider.updateMany({ where: { userId: target.id }, data: { isOnline: false } });
      }
    });
    return { ok: true };
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/admins',
  basePath,
  tags: ['Admin: users'],
  summary: 'Grant admin access to a phone number (optionally set a password)',
  auth: 'required',
  roles,
  status: 201,
  body: z.object({ phone: phoneSchema, name: z.string().trim().min(2).max(80), password: passwordSchema.optional() }),
  handler: async ({ body }) => {
    const passwordHash = body.password ? await hashPassword(body.password) : undefined;
    const target = await prisma.user.upsert({
      where: { phone: body.phone },
      create: { phone: body.phone, name: body.name, passwordHash },
      update: { ...(passwordHash ? { passwordHash } : {}) },
    });
    await ensureRole(prisma, target.id, 'ADMIN');
    return { id: target.id, phone: target.phone, name: target.name };
  },
});

// ───────────────────────────── Disputes & refunds ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/disputes',
  basePath,
  tags: ['Admin: disputes'],
  summary: 'List disputes',
  auth: 'required',
  roles,
  query: pagination.extend({ status: z.enum(['OPEN', 'RESOLVED', 'REJECTED']).optional() }),
  handler: async ({ query }) => {
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              code: true,
              totalCents: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
              vendor: { select: { name: true } },
              rider: { select: { id: true, user: { select: { name: true } } } },
            },
          },
          raisedBy: { select: { name: true, phone: true } },
          refunds: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.dispute.count({ where }),
    ]);
    return paged(items, total, query.page, query.pageSize);
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/disputes/:id/resolve',
  basePath,
  tags: ['Admin: disputes'],
  summary: 'Resolve or reject a dispute, optionally issuing a refund',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({
    status: z.enum(['RESOLVED', 'REJECTED']),
    resolution: trimmed(1000),
    refundCents: z.number().int().min(1).max(10_000_000).optional(),
    refundMethod: z.enum(['ECOCASH', 'ONEMONEY', 'CARD', 'CASH', 'BANK']).optional(),
    refundReference: optionalTrimmed(80),
  }),
  handler: async ({ params, body, user }) => {
    const dispute = await prisma.dispute.findUnique({
      where: { id: params.id },
      include: { order: { include: { payments: true, refunds: true, customer: true } } },
    });
    if (!dispute) throw notFound('Dispute');
    if (dispute.status !== 'OPEN') throw conflict('This dispute is already closed.');
    const order = dispute.order;
    if (body.refundCents) {
      if (body.status !== 'RESOLVED') throw badRequest('Refunds can only be issued when resolving a dispute.');
      const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amountCents, 0);
      if (body.refundCents + alreadyRefunded > order.totalCents) {
        throw badRequest(`Refund exceeds the order total (already refunded ${formatMoney(alreadyRefunded, 'USD')}).`);
      }
    }
    const paidPayment = order.payments.find((p) => p.purpose === 'ORDER' && (p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED'));

    await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          status: body.status,
          resolution: body.resolution,
          refundCents: body.refundCents ?? null,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
      });
      if (body.refundCents) {
        const completed = Boolean(body.refundReference);
        await tx.refund.create({
          data: {
            orderId: order.id,
            disputeId: dispute.id,
            paymentId: paidPayment?.id,
            amountCents: body.refundCents,
            method: body.refundMethod ?? paidPayment?.method ?? 'CASH',
            reference: body.refundReference,
            status: completed ? 'COMPLETED' : 'PENDING',
            processedById: completed ? user.id : null,
            processedAt: completed ? new Date() : null,
            notes: body.resolution.slice(0, 200),
          },
        });
        if (completed && paidPayment) await syncPaymentRefundStatus(tx, paidPayment.id);
      }
    });

    notifyAsync({
      userId: order.customer.userId,
      type: 'DISPUTE_UPDATED',
      title: body.status === 'RESOLVED' ? 'Your issue was resolved' : 'Update on your reported issue',
      body: `Order ${order.code}: ${body.resolution}${
        body.refundCents ? ` Refund: ${formatMoney(body.refundCents, 'USD')}.` : ''
      }`,
      data: { orderId: order.id },
      fallbackToSms: true,
    });
    return prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id }, include: { refunds: true } });
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/refunds',
  basePath,
  tags: ['Admin: disputes'],
  summary: 'List refunds',
  auth: 'required',
  roles,
  query: pagination.extend({ status: z.enum(['PENDING', 'COMPLETED']).optional() }),
  handler: async ({ query }) => {
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        include: { order: { select: { id: true, code: true, customer: { select: { user: { select: { name: true, phone: true } } } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.refund.count({ where }),
    ]);
    return paged(items, total, query.page, query.pageSize);
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/refunds/:id/complete',
  basePath,
  tags: ['Admin: disputes'],
  summary: 'Mark a refund as paid back to the customer',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ reference: trimmed(80), method: z.enum(['ECOCASH', 'ONEMONEY', 'CARD', 'CASH', 'BANK']).optional() }),
  handler: ({ params, body, user }) => completeRefund(params.id, user.id, body),
});

// ───────────────────────────── Payouts ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/payouts',
  basePath,
  tags: ['Admin: payouts'],
  summary: 'List rider and vendor payouts',
  auth: 'required',
  roles,
  query: pagination.extend({
    status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'REJECTED']).optional(),
    payeeType: z.enum(['RIDER', 'VENDOR']).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.PayoutWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.payeeType ? { payeeType: query.payeeType } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        include: {
          rider: { select: { id: true, user: { select: { name: true, phone: true } } } },
          vendor: { select: { id: true, name: true } },
        },
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.payout.count({ where }),
    ]);
    return paged(items, total, query.page, query.pageSize);
  },
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/payouts/:id/process',
  basePath,
  tags: ['Admin: payouts'],
  summary: 'Mark a payout processing, paid (with reference) or rejected (rider funds returned)',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({
    status: z.enum(['PROCESSING', 'PAID', 'REJECTED']),
    reference: optionalTrimmed(80),
    notes: optionalTrimmed(300),
  }),
  handler: ({ params, body, user }) => processPayout(params.id, user.id, body),
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/payouts/vendors/generate',
  basePath,
  tags: ['Admin: payouts'],
  summary: 'Create payouts for all vendors with an outstanding balance',
  auth: 'required',
  roles,
  handler: () => generateVendorPayouts(),
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/payouts/vendors/:id',
  basePath,
  tags: ['Admin: payouts'],
  summary: 'Create a payout for one vendor (defaults to full balance)',
  auth: 'required',
  roles,
  params: idParams,
  status: 201,
  body: z.object({ amountCents: z.number().int().min(1).optional() }),
  handler: ({ params, body }) => createVendorPayout(params.id, body.amountCents),
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/payouts/riders/run-weekly',
  basePath,
  tags: ['Admin: payouts'],
  summary: 'Run the weekly rider payout batch now',
  auth: 'required',
  roles,
  handler: async () => ({ created: await runWeeklyRiderPayouts(true) }),
});

// ───────────────────────────── Settings, zones, bonuses, categories ─────────────────────────────

defineRoute(adminRouter, {
  method: 'get',
  path: '/settings',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Platform settings (commission, fees, rider pay, cash limit, exchange rate, dispatch)',
  auth: 'required',
  roles,
  handler: () => getSettings(),
});

defineRoute(adminRouter, {
  method: 'put',
  path: '/settings',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Update platform settings (partial)',
  auth: 'required',
  roles,
  body: settingsUpdateSchema,
  handler: ({ body, user }) => updateSettings(body, user.id),
});

const zoneBody = z.object({
  name: trimmed(60),
  city: trimmed(60),
  centerLat: latLng.lat,
  centerLng: latLng.lng,
  radiusKm: z.number().positive().max(200),
  polygon: z
    .array(z.tuple([latLng.lat, latLng.lng]))
    .min(3)
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
  deliveryFeeBaseCents: z.number().int().min(0).nullable().optional(),
  deliveryFeePerKmCents: z.number().int().min(0).nullable().optional(),
  riderBaseCents: z.number().int().min(0).nullable().optional(),
  riderPerKmCents: z.number().int().min(0).nullable().optional(),
});

function zoneData<T extends { polygon?: Array<[number, number]> | null }>(body: T) {
  const { polygon, ...rest } = body;
  if (polygon && !isValidPolygon(polygon)) throw badRequest('Polygon must have at least 3 [lat, lng] points');
  return {
    ...rest,
    ...(polygon === undefined ? {} : { polygon: polygon === null ? (null as unknown as Prisma.InputJsonValue) : polygon }),
  };
}

defineRoute(adminRouter, {
  method: 'get',
  path: '/zones',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Service zones',
  auth: 'required',
  roles,
  handler: () =>
    prisma.zone.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { vendors: true, riders: true } } },
    }),
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/zones',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Create a service zone',
  auth: 'required',
  roles,
  status: 201,
  body: zoneBody,
  handler: ({ body }) => prisma.zone.create({ data: zoneData(body) as Prisma.ZoneCreateInput }),
});

defineRoute(adminRouter, {
  method: 'patch',
  path: '/zones/:id',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Update a service zone',
  auth: 'required',
  roles,
  params: idParams,
  body: zoneBody.partial(),
  handler: async ({ params, body }) => {
    const exists = await prisma.zone.findUnique({ where: { id: params.id } });
    if (!exists) throw notFound('Zone');
    return prisma.zone.update({ where: { id: params.id }, data: zoneData(body) as Prisma.ZoneUpdateInput });
  },
});

defineRoute(adminRouter, {
  method: 'delete',
  path: '/zones/:id',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Delete a service zone',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params }) => {
    const res = await prisma.zone.deleteMany({ where: { id: params.id } });
    if (res.count === 0) throw notFound('Zone');
    return { ok: true };
  },
});

const bonusBody = z.object({
  name: trimmed(80),
  deliveriesTarget: z.number().int().min(1).max(1000),
  period: z.enum(['DAILY', 'WEEKLY']),
  amountCents: z.number().int().min(1).max(1_000_000),
  isActive: z.boolean().default(true),
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/bonus-rules',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Rider bonus rules',
  auth: 'required',
  roles,
  handler: () =>
    prisma.bonusRule.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { awards: true } } } }),
});

defineRoute(adminRouter, {
  method: 'post',
  path: '/bonus-rules',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Create a bonus rule (e.g. 10 deliveries/day → US$3)',
  auth: 'required',
  roles,
  status: 201,
  body: bonusBody,
  handler: ({ body }) => prisma.bonusRule.create({ data: body }),
});

defineRoute(adminRouter, {
  method: 'patch',
  path: '/bonus-rules/:id',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Update a bonus rule',
  auth: 'required',
  roles,
  params: idParams,
  body: bonusBody.partial(),
  handler: async ({ params, body }) => {
    const res = await prisma.bonusRule.updateMany({ where: { id: params.id }, data: body });
    if (res.count === 0) throw notFound('Bonus rule');
    return prisma.bonusRule.findUniqueOrThrow({ where: { id: params.id } });
  },
});

defineRoute(adminRouter, {
  method: 'delete',
  path: '/bonus-rules/:id',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Delete a bonus rule',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params }) => {
    const res = await prisma.bonusRule.deleteMany({ where: { id: params.id } });
    if (res.count === 0) throw notFound('Bonus rule');
    return { ok: true };
  },
});

defineRoute(adminRouter, {
  method: 'get',
  path: '/categories',
  basePath,
  tags: ['Admin: settings'],
  summary: 'All service categories',
  auth: 'required',
  roles,
  handler: () => prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { vendors: true } } } }),
});

defineRoute(adminRouter, {
  method: 'patch',
  path: '/categories/:id',
  basePath,
  tags: ['Admin: settings'],
  summary: 'Update a category (name, icon, order, visibility)',
  auth: 'required',
  roles,
  params: idParams,
  body: z
    .object({
      name: trimmed(40),
      icon: optionalTrimmed(40),
      sortOrder: z.number().int().min(0).max(99),
      isActive: z.boolean(),
    })
    .partial(),
  handler: async ({ params, body }) => {
    const res = await prisma.category.updateMany({ where: { id: params.id }, data: body });
    if (res.count === 0) throw notFound('Category');
    return prisma.category.findUniqueOrThrow({ where: { id: params.id } });
  },
});
