import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { defineRoute, idParams, latLng, paged, pagination } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { HHMM, TIMEZONE } from '../../lib/time';
import { slugify, randomCode } from '../../lib/random';
import { imageUrl, moneyCents, optionalTrimmed, phoneSchema, trimmed } from '../../lib/validation';
import { ensureRole } from '../auth/auth.service';
import { notifyAdmins } from '../notifications/notification.service';
import { orderInclude, presentOrder, ACTIVE_STATUSES } from '../orders/order.presenter';
import { getOrderForUser, transitionOrder } from '../orders/order.service';
import { findZoneForPoint } from '../pricing/pricing.service';
import { presentProduct, presentVendorPublic, requireOwnVendor } from './vendor.service';
import { vendorBalance, vendorSalesReport, vendorStatement } from './vendor-reports.service';

export const vendorPortalRouter = Router();
const basePath = '/api/v1/vendor';
const tags = ['Vendor dashboard'];
const roles = ['VENDOR' as const];

const storeFields = {
  name: trimmed(80),
  description: optionalTrimmed(500),
  phone: phoneSchema,
  email: z.string().trim().email().max(120).optional(),
  categorySlug: z.enum(['food', 'groceries', 'pharmacy']),
  ...latLng,
  addressLine: trimmed(160),
  landmark: optionalTrimmed(200),
  city: z.string().trim().min(2).max(60).default('Harare'),
  logoUrl: imageUrl.optional(),
  coverUrl: imageUrl.optional(),
  avgPrepMinutes: z.number().int().min(1).max(180).default(20),
  minOrderCents: moneyCents.default(0),
};

const payoutFields = {
  payoutMethod: z.enum(['ECOCASH', 'ONEMONEY', 'BANK']).optional(),
  payoutAccount: optionalTrimmed(40),
  payoutAccountName: optionalTrimmed(80),
  payoutBankName: optionalTrimmed(80),
};

async function presentOwnVendor(vendorId: string) {
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    include: { openingHours: true, category: { select: { slug: true, name: true } }, zone: { select: { id: true, name: true } } },
  });
  return {
    ...presentVendorPublic(vendor),
    email: vendor.email,
    status: vendor.status,
    zone: vendor.zone,
    commissionRateBps: vendor.commissionRateBps,
    payoutMethod: vendor.payoutMethod,
    payoutAccount: vendor.payoutAccount,
    payoutAccountName: vendor.payoutAccountName,
    payoutBankName: vendor.payoutBankName,
    timezone: TIMEZONE,
    createdAt: vendor.createdAt,
  };
}

// ───────────────────────────── Store profile ─────────────────────────────

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/onboarding',
  basePath,
  tags,
  summary: 'Create my store (vendor onboarding — pending admin approval)',
  auth: 'required',
  status: 201,
  body: z.object({ ...storeFields, ...payoutFields, ownerName: z.string().trim().min(2).max(80).optional() }),
  handler: async ({ body, user }) => {
    const existing = await prisma.vendor.findUnique({ where: { userId: user.id } });
    if (existing) throw conflict('You already have a store.');
    const category = await prisma.category.findUnique({ where: { slug: body.categorySlug } });
    if (!category) throw badRequest('Unknown category');
    const zone = await findZoneForPoint(body);
    const baseSlug = slugify(body.name) || 'store';
    const slugTaken = await prisma.vendor.findUnique({ where: { slug: baseSlug } });
    const { categorySlug, ownerName, ...data } = body;
    void categorySlug;

    const vendor = await prisma.$transaction(async (tx) => {
      await ensureRole(tx, user.id, 'VENDOR');
      if (ownerName) await tx.user.updateMany({ where: { id: user.id, name: null }, data: { name: ownerName } });
      const created = await tx.vendor.create({
        data: {
          ...data,
          userId: user.id,
          categoryId: category.id,
          zoneId: zone?.id,
          slug: slugTaken ? `${baseSlug}-${randomCode(4).toLowerCase()}` : baseSlug,
          openingHours: {
            // Sensible default: 08:00–20:00 every day; editable in the dashboard.
            create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '08:00', closesAt: '20:00' })),
          },
        },
      });
      return created;
    });
    void notifyAdmins({
      type: 'VENDOR_PENDING',
      title: 'New store awaiting approval',
      body: `${vendor.name} signed up and needs review.`,
      data: { vendorId: vendor.id },
    });
    return presentOwnVendor(vendor.id);
  },
});

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/me',
  basePath,
  tags,
  summary: 'My store profile',
  auth: 'required',
  roles,
  handler: async ({ user }) => presentOwnVendor((await requireOwnVendor(user.id)).id),
});

defineRoute(vendorPortalRouter, {
  method: 'patch',
  path: '/me',
  basePath,
  tags,
  summary: 'Update my store profile, open/closed toggle and payout details',
  auth: 'required',
  roles,
  body: z
    .object({
      ...storeFields,
      ...payoutFields,
      isAcceptingOrders: z.boolean(),
      logoUrl: imageUrl.nullable(),
      coverUrl: imageUrl.nullable(),
    })
    .partial(),
  handler: async ({ body, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const { categorySlug, ...rest } = body;
    const data: Prisma.VendorUncheckedUpdateInput = { ...rest };
    if (categorySlug) {
      const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
      if (!category) throw badRequest('Unknown category');
      data.categoryId = category.id;
    }
    if (body.lat !== undefined && body.lng !== undefined) {
      data.zoneId = (await findZoneForPoint({ lat: body.lat, lng: body.lng }))?.id ?? null;
    }
    await prisma.vendor.update({ where: { id: vendor.id }, data });
    return presentOwnVendor(vendor.id);
  },
});

defineRoute(vendorPortalRouter, {
  method: 'put',
  path: '/me/hours',
  basePath,
  tags,
  summary: 'Replace weekly opening hours (Africa/Harare time; omit a day = closed)',
  auth: 'required',
  roles,
  body: z.object({
    hours: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          opensAt: z.string().regex(HHMM, 'Use HH:mm'),
          closesAt: z.string().regex(HHMM, 'Use HH:mm'),
        }),
      )
      .max(7)
      .refine((h) => new Set(h.map((x) => x.dayOfWeek)).size === h.length, 'Each day can appear only once'),
  }),
  handler: async ({ body, user }) => {
    const vendor = await requireOwnVendor(user.id);
    await prisma.$transaction([
      prisma.vendorOpeningHour.deleteMany({ where: { vendorId: vendor.id } }),
      prisma.vendorOpeningHour.createMany({ data: body.hours.map((h) => ({ ...h, vendorId: vendor.id })) }),
    ]);
    return presentOwnVendor(vendor.id);
  },
});

// ───────────────────────────── Menu sections ─────────────────────────────

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/sections',
  basePath,
  tags,
  summary: 'Menu sections',
  auth: 'required',
  roles,
  handler: async ({ user }) => {
    const vendor = await requireOwnVendor(user.id);
    return prisma.menuSection.findMany({
      where: { vendorId: vendor.id },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { isDeleted: false } } } } },
    });
  },
});

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/sections',
  basePath,
  tags,
  summary: 'Create a menu section',
  auth: 'required',
  roles,
  status: 201,
  body: z.object({ name: trimmed(60), sortOrder: z.number().int().min(0).max(999).default(0) }),
  handler: async ({ body, user }) => {
    const vendor = await requireOwnVendor(user.id);
    return prisma.menuSection.create({ data: { ...body, vendorId: vendor.id } });
  },
});

defineRoute(vendorPortalRouter, {
  method: 'patch',
  path: '/sections/:id',
  basePath,
  tags,
  summary: 'Rename or reorder a menu section',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ name: trimmed(60), sortOrder: z.number().int().min(0).max(999) }).partial(),
  handler: async ({ body, params, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const res = await prisma.menuSection.updateMany({ where: { id: params.id, vendorId: vendor.id }, data: body });
    if (res.count === 0) throw notFound('Section');
    return prisma.menuSection.findUniqueOrThrow({ where: { id: params.id } });
  },
});

defineRoute(vendorPortalRouter, {
  method: 'delete',
  path: '/sections/:id',
  basePath,
  tags,
  summary: 'Delete a menu section (its products become unsectioned)',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const res = await prisma.menuSection.deleteMany({ where: { id: params.id, vendorId: vendor.id } });
    if (res.count === 0) throw notFound('Section');
    return { ok: true };
  },
});

// ───────────────────────────── Products ─────────────────────────────

const productBody = z.object({
  name: trimmed(100),
  description: optionalTrimmed(500),
  priceCents: z.number().int().min(1).max(10_000_000),
  sectionId: z.string().max(64).nullable().optional(),
  imageUrl: imageUrl.nullable().optional(),
  thumbUrl: imageUrl.nullable().optional(),
  isAvailable: z.boolean().default(true),
  trackStock: z.boolean().default(false),
  stockQty: z.number().int().min(0).max(1_000_000).default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

async function assertSection(vendorId: string, sectionId: string | null | undefined) {
  if (!sectionId) return;
  const s = await prisma.menuSection.findFirst({ where: { id: sectionId, vendorId } });
  if (!s) throw badRequest('Unknown menu section');
}

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/products',
  basePath,
  tags,
  summary: 'My products',
  auth: 'required',
  roles,
  query: z.object({ q: z.string().trim().max(80).optional(), sectionId: z.string().max(64).optional() }),
  handler: async ({ query, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const products = await prisma.product.findMany({
      where: {
        vendorId: vendor.id,
        isDeleted: false,
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return products.map((p) => ({ ...presentProduct(p), rawStockQty: p.stockQty, rawIsAvailable: p.isAvailable }));
  },
});

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/products',
  basePath,
  tags,
  summary: 'Add a product',
  auth: 'required',
  roles,
  status: 201,
  body: productBody,
  handler: async ({ body, user }) => {
    const vendor = await requireOwnVendor(user.id);
    await assertSection(vendor.id, body.sectionId);
    const product = await prisma.product.create({ data: { ...body, vendorId: vendor.id } });
    return presentProduct(product);
  },
});

defineRoute(vendorPortalRouter, {
  method: 'patch',
  path: '/products/:id',
  basePath,
  tags,
  summary: 'Update a product (price, stock, availability, image…)',
  auth: 'required',
  roles,
  params: idParams,
  body: productBody.partial(),
  handler: async ({ body, params, user }) => {
    const vendor = await requireOwnVendor(user.id);
    await assertSection(vendor.id, body.sectionId);
    const res = await prisma.product.updateMany({ where: { id: params.id, vendorId: vendor.id, isDeleted: false }, data: body });
    if (res.count === 0) throw notFound('Product');
    return presentProduct(await prisma.product.findUniqueOrThrow({ where: { id: params.id } }));
  },
});

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/products/:id/stock',
  basePath,
  tags,
  summary: 'Adjust stock (set an absolute quantity or add/subtract a delta)',
  auth: 'required',
  roles,
  params: idParams,
  body: z.union([
    z.object({ set: z.number().int().min(0).max(1_000_000) }),
    z.object({ delta: z.number().int().min(-1_000_000).max(1_000_000) }),
  ]),
  handler: async ({ body, params, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const product = await prisma.product.findFirst({ where: { id: params.id, vendorId: vendor.id, isDeleted: false } });
    if (!product) throw notFound('Product');
    const next = 'set' in body ? body.set : Math.max(0, product.stockQty + body.delta);
    const updated = await prisma.product.update({ where: { id: product.id }, data: { stockQty: next, trackStock: true } });
    return presentProduct(updated);
  },
});

defineRoute(vendorPortalRouter, {
  method: 'delete',
  path: '/products/:id',
  basePath,
  tags,
  summary: 'Delete a product',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const res = await prisma.product.updateMany({
      where: { id: params.id, vendorId: vendor.id },
      data: { isDeleted: true, isAvailable: false },
    });
    if (res.count === 0) throw notFound('Product');
    return { ok: true };
  },
});

// ───────────────────────────── Orders ─────────────────────────────

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/orders',
  basePath,
  tags,
  summary: 'Store orders (filter by status or "active")',
  auth: 'required',
  roles,
  query: pagination.extend({
    status: z
      .enum(['active', 'PLACED', 'ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED', 'REJECTED', 'CANCELLED'])
      .optional(),
    q: z.string().trim().max(40).optional(),
  }),
  handler: async ({ query, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const where: Prisma.OrderWhereInput = {
      vendorId: vendor.id,
      status: query.status === 'active' ? { in: ACTIVE_STATUSES } : query.status ? query.status : { not: 'PENDING_PAYMENT' },
      ...(query.q ? { code: { contains: query.q.toUpperCase() } } : {}),
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
    return paged(items.map((o) => presentOrder(o, 'vendor')), total, query.page, query.pageSize);
  },
});

async function ownOrder(userId: string, orderId: string) {
  const vendor = await requireOwnVendor(userId, { approved: true });
  const order = await prisma.order.findFirst({ where: { id: orderId, vendorId: vendor.id } });
  if (!order) throw notFound('Order');
  return { vendor, order };
}

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/orders/:id/accept',
  basePath,
  tags,
  summary: 'Accept an order and set preparation time',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ prepMinutes: z.number().int().min(1).max(180) }),
  handler: async ({ body, params, user }) => {
    await ownOrder(user.id, params.id);
    await transitionOrder(params.id, 'ACCEPTED', {
      actorId: user.id,
      from: ['PLACED'],
      message: `Accepted — ready in ~${body.prepMinutes} min`,
      data: { prepMinutes: body.prepMinutes, estimatedReadyAt: new Date(Date.now() + body.prepMinutes * 60_000) },
    });
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/orders/:id/reject',
  basePath,
  tags,
  summary: 'Reject an order',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ reason: trimmed(200) }),
  handler: async ({ body, params, user }) => {
    await ownOrder(user.id, params.id);
    await transitionOrder(params.id, 'REJECTED', {
      actorId: user.id,
      from: ['PLACED'],
      message: `Rejected by store: ${body.reason}`,
      data: { rejectReason: body.reason },
    });
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/orders/:id/prep-time',
  basePath,
  tags,
  summary: 'Update preparation time for an accepted order',
  auth: 'required',
  roles,
  params: idParams,
  body: z.object({ prepMinutes: z.number().int().min(1).max(180) }),
  handler: async ({ body, params, user }) => {
    const { order } = await ownOrder(user.id, params.id);
    if (order.status !== 'ACCEPTED') throw conflict('Prep time can only be changed while preparing.');
    const base = order.acceptedAt ?? new Date();
    await prisma.order.update({
      where: { id: order.id },
      data: { prepMinutes: body.prepMinutes, estimatedReadyAt: new Date(base.getTime() + body.prepMinutes * 60_000) },
    });
    await prisma.orderEvent.create({
      data: { orderId: order.id, type: 'NOTE', message: `Prep time updated to ${body.prepMinutes} min`, actorId: user.id },
    });
    return (await getOrderForUser(user, params.id)).presented;
  },
});

defineRoute(vendorPortalRouter, {
  method: 'post',
  path: '/orders/:id/ready',
  basePath,
  tags,
  summary: 'Mark an order ready for pickup',
  auth: 'required',
  roles,
  params: idParams,
  handler: async ({ params, user }) => {
    await ownOrder(user.id, params.id);
    await transitionOrder(params.id, 'READY_FOR_PICKUP', { actorId: user.id, from: ['ACCEPTED'] });
    return (await getOrderForUser(user, params.id)).presented;
  },
});

// ───────────────────────────── Reports & payouts ─────────────────────────────

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function resolveRange(q: { from?: Date; to?: Date }) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
  if (from > to) throw badRequest('"from" must be before "to"');
  if (to.getTime() - from.getTime() > 366 * 86_400_000) throw badRequest('Range cannot exceed one year');
  return { from, to };
}

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/reports/sales',
  basePath,
  tags,
  summary: 'Daily sales report (delivered orders)',
  auth: 'required',
  roles,
  query: rangeQuery,
  handler: async ({ query, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const { from, to } = resolveRange(query);
    return vendorSalesReport(vendor.id, from, to);
  },
});

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/reports/statement',
  basePath,
  tags,
  summary: 'Commission statement: gross sales, commission, net earnings, payouts and balance',
  auth: 'required',
  roles,
  query: rangeQuery,
  handler: async ({ query, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const { from, to } = resolveRange(query);
    return vendorStatement(vendor.id, from, to);
  },
});

defineRoute(vendorPortalRouter, {
  method: 'get',
  path: '/payouts',
  basePath,
  tags,
  summary: 'Payout history and current balance',
  auth: 'required',
  roles,
  query: pagination,
  handler: async ({ query, user }) => {
    const vendor = await requireOwnVendor(user.id);
    const where = { vendorId: vendor.id, payeeType: 'VENDOR' as const };
    const [items, total, balance] = await Promise.all([
      prisma.payout.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.payout.count({ where }),
      vendorBalance(vendor.id),
    ]);
    return { ...paged(items, total, query.page, query.pageSize), balance };
  },
});
