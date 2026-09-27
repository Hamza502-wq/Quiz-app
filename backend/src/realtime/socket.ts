import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { resolveUser, type AuthUser } from '../middleware/auth';
import { viewerFor } from '../modules/orders/order.service';
import { updateRiderLocation } from '../modules/riders/rider.service';
import { rooms, setIo } from './io';

interface SocketData {
  user: AuthUser;
  riderId?: string;
  riderApproved?: boolean;
  lastLocationAt?: number;
}

type Ack = (response: { ok: boolean; error?: string }) => void;

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(100).optional(),
});

const LOCATION_MIN_INTERVAL_MS = 1_000;

/**
 * Socket.IO server. Clients authenticate with `auth: { token: <access JWT> }`.
 *
 * Rooms joined automatically: user:<id>, rider:<id>, vendor:<id>, admins.
 * Client → server events:
 *   order:subscribe { orderId }   — join an order's live room (access-checked)
 *   order:unsubscribe { orderId }
 *   rider:location { lat, lng, heading?, speed? } — riders only
 * Server → client events: see ServerEvents in ./io.ts
 */
export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(async (socket, next) => {
    const raw =
      (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!raw) return next(new Error('unauthorized'));
    try {
      (socket.data as SocketData).user = await resolveUser(raw);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    const { user } = data;
    // Handlers are registered synchronously below and await this, so events
    // emitted right after connecting are never dropped while rooms are set up.
    const ready = setupRooms(socket, data).catch((err) => logger.error({ err }, 'Socket room setup failed'));

    socket.on('order:subscribe', async (payload: unknown, ack?: Ack) => {
      await ready;
      const parsed = z.object({ orderId: z.string().min(1).max(64) }).safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'Invalid payload' });
      try {
        const order = await prisma.order.findUnique({
          where: { id: parsed.data.orderId },
          select: {
            id: true,
            customer: { select: { userId: true } },
            vendor: { select: { userId: true } },
            rider: { select: { userId: true } },
          },
        });
        if (!order || !viewerFor(user, order)) return ack?.({ ok: false, error: 'Order not found' });
        await socket.join(rooms.order(order.id));
        ack?.({ ok: true });
      } catch (err) {
        logger.error({ err }, 'order:subscribe failed');
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    socket.on('order:unsubscribe', async (payload: unknown) => {
      const parsed = z.object({ orderId: z.string().min(1).max(64) }).safeParse(payload);
      if (parsed.success) await socket.leave(rooms.order(parsed.data.orderId));
    });

    socket.on('rider:location', async (payload: unknown, ack?: Ack) => {
      await ready;
      if (!data.riderId || !data.riderApproved) return ack?.({ ok: false, error: 'Not an approved rider' });
      const now = Date.now();
      if (data.lastLocationAt && now - data.lastLocationAt < LOCATION_MIN_INTERVAL_MS) return ack?.({ ok: true });
      const parsed = locationSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'Invalid location' });
      data.lastLocationAt = now;
      try {
        await updateRiderLocation(data.riderId, parsed.data);
        ack?.({ ok: true });
      } catch (err) {
        logger.error({ err }, 'rider:location failed');
        ack?.({ ok: false, error: 'Server error' });
      }
    });
  });

  setIo(io);
  return io;
}

async function setupRooms(socket: Socket, data: SocketData): Promise<void> {
  const { user } = data;
  await socket.join(rooms.user(user.id));
  if (user.roles.includes('ADMIN')) await socket.join(rooms.admins);
  if (user.roles.includes('RIDER')) {
    const rider = await prisma.rider.findUnique({ where: { userId: user.id }, select: { id: true, status: true } });
    if (rider) {
      data.riderId = rider.id;
      data.riderApproved = rider.status === 'APPROVED';
      await socket.join(rooms.rider(rider.id));
    }
  }
  if (user.roles.includes('VENDOR')) {
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (vendor) await socket.join(rooms.vendor(vendor.id));
  }
}
