import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { orderInclude, presentOrder } from './order.presenter';

/**
 * Pushes the latest state of an order to everyone involved, each receiving the
 * view appropriate to their role. Never throws.
 */
export async function publishOrderUpdate(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) return;
    emitTo(rooms.user(order.customer.userId), ServerEvents.orderUpdated, presentOrder(order, 'customer'));
    if (order.vendorId) emitTo(rooms.vendor(order.vendorId), ServerEvents.orderUpdated, presentOrder(order, 'vendor'));
    if (order.riderId) emitTo(rooms.rider(order.riderId), ServerEvents.orderUpdated, presentOrder(order, 'rider'));
    emitTo(rooms.admins, ServerEvents.orderUpdated, presentOrder(order, 'admin'));
  } catch (err) {
    logger.error({ err, orderId }, 'Failed to publish order update');
  }
}
