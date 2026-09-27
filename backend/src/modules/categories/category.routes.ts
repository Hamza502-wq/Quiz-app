import { Router } from 'express';
import { defineRoute } from '../../lib/route';
import { prisma } from '../../lib/prisma';

export const categoryRouter = Router();

defineRoute(categoryRouter, {
  method: 'get',
  path: '/',
  basePath: '/api/v1/categories',
  tags: ['Vendors (public)'],
  summary: 'Service categories (food, groceries, pharmacy, parcels)',
  auth: 'public',
  handler: () =>
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, icon: true, sortOrder: true },
    }),
});
