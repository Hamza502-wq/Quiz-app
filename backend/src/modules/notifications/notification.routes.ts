import { Router } from 'express';
import { z } from 'zod';
import { defineRoute, idParams, paged, pagination } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

export const notificationRouter = Router();
const basePath = '/api/v1/notifications';
const tags = ['Notifications'];

defineRoute(notificationRouter, {
  method: 'get',
  path: '/',
  basePath,
  tags,
  summary: 'List my notifications (newest first)',
  auth: 'required',
  query: pagination,
  handler: async ({ query, user }) => {
    const where = { userId: user.id };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { ...paged(items, total, query.page, query.pageSize), unread };
  },
});

defineRoute(notificationRouter, {
  method: 'post',
  path: '/:id/read',
  basePath,
  tags,
  summary: 'Mark a notification as read',
  auth: 'required',
  params: idParams,
  handler: async ({ params, user }) => {
    const result = await prisma.notification.updateMany({
      where: { id: params.id, userId: user.id },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw notFound('Notification');
    return { ok: true };
  },
});

defineRoute(notificationRouter, {
  method: 'post',
  path: '/read-all',
  basePath,
  tags,
  summary: 'Mark all notifications as read',
  auth: 'required',
  handler: async ({ user }) => {
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  },
});

defineRoute(notificationRouter, {
  method: 'post',
  path: '/device-tokens',
  basePath,
  tags,
  summary: 'Register an FCM device token for push notifications',
  auth: 'required',
  body: z.object({ token: z.string().min(10).max(4096), platform: z.enum(['android', 'ios', 'web']).default('android') }),
  handler: async ({ body, user }) => {
    await prisma.deviceToken.upsert({
      where: { token: body.token },
      create: { token: body.token, platform: body.platform, userId: user.id },
      update: { userId: user.id, platform: body.platform },
    });
    return { ok: true };
  },
});

defineRoute(notificationRouter, {
  method: 'delete',
  path: '/device-tokens',
  basePath,
  tags,
  summary: 'Unregister an FCM device token (on logout)',
  auth: 'required',
  body: z.object({ token: z.string().min(10).max(4096) }),
  handler: async ({ body, user }) => {
    await prisma.deviceToken.deleteMany({ where: { token: body.token, userId: user.id } });
    return { ok: true };
  },
});
