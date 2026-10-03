import { Router } from 'express';
import { z } from 'zod';
import { defineRoute, idParams, paged, pagination, queryBool } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { getVendorMenu, listVendors } from './vendor.service';

export const vendorRouter = Router();
const basePath = '/api/v1/vendors';
const tags = ['Vendors (public)'];

defineRoute(vendorRouter, {
  method: 'get',
  path: '/',
  basePath,
  tags,
  summary: 'Browse vendors by category with search, filters and open/closed status',
  auth: 'public',
  query: pagination.extend({
    category: z.string().max(40).optional(),
    q: z.string().trim().max(80).optional(),
    openNow: queryBool.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    sort: z.enum(['recommended', 'rating', 'distance', 'deliveryFee']).default('recommended'),
    maxDeliveryFeeCents: z.coerce.number().int().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
  }),
  handler: ({ query }) => listVendors(query),
});

defineRoute(vendorRouter, {
  method: 'get',
  path: '/:id',
  basePath,
  tags,
  summary: 'Vendor details with menu (by id or slug); pass lat/lng for delivery fee & ETA',
  auth: 'public',
  params: idParams,
  query: z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  }),
  handler: ({ params, query }) =>
    getVendorMenu(params.id, query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null),
});

defineRoute(vendorRouter, {
  method: 'get',
  path: '/:id/reviews',
  basePath,
  tags,
  summary: 'Customer reviews for a vendor',
  auth: 'public',
  params: idParams,
  query: pagination,
  handler: async ({ params, query }) => {
    const where = { vendorId: params.id, target: 'VENDOR' as const };
    const [items, total] = await Promise.all([
      prisma.rating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, score: true, comment: true, createdAt: true, rater: { select: { name: true } } },
      }),
      prisma.rating.count({ where }),
    ]);
    return paged(
      items.map((r) => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        createdAt: r.createdAt,
        // First name only, for privacy.
        customerName: r.rater.name?.split(' ')[0] ?? 'Customer',
      })),
      total,
      query.page,
      query.pageSize,
    );
  },
});
