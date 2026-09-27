import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { notifyAsync } from '../notifications/notification.service';
import { TERMINAL_STATUSES } from '../orders/order.presenter';

/** Chat is between the order's customer and its assigned rider. */
async function loadParticipants(user: AuthUser, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, rider: true },
  });
  if (!order) throw notFound('Order');
  const isCustomer = order.customer.userId === user.id;
  const isRider = order.rider?.userId === user.id;
  const isAdmin = user.roles.includes('ADMIN');
  if (!isCustomer && !isRider && !isAdmin) throw notFound('Order');
  return { order, isCustomer, isRider };
}

function present(m: { id: string; orderId: string; senderId: string; body: string; createdAt: Date; readAt: Date | null }, viewerId: string) {
  return { id: m.id, orderId: m.orderId, body: m.body, createdAt: m.createdAt, readAt: m.readAt, mine: m.senderId === viewerId, senderId: m.senderId };
}

export async function listMessages(user: AuthUser, orderId: string) {
  await loadParticipants(user, orderId);
  const messages = await prisma.chatMessage.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, take: 200 });
  await prisma.chatMessage.updateMany({
    where: { orderId, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  });
  return messages.map((m) => present(m, user.id));
}

export async function sendMessage(user: AuthUser, orderId: string, body: string) {
  const { order, isCustomer, isRider } = await loadParticipants(user, orderId);
  if (!isCustomer && !isRider) throw conflict('Only the customer and rider can chat on an order.');
  if (!order.rider) throw conflict('Chat opens once a rider is assigned.');
  if (TERMINAL_STATUSES.includes(order.status)) throw conflict('This order is closed.');

  const message = await prisma.chatMessage.create({ data: { orderId, senderId: user.id, body } });
  const recipientId = isCustomer ? order.rider.userId : order.customer.userId;
  emitTo(rooms.user(recipientId), ServerEvents.chatMessage, present(message, recipientId));
  emitTo(rooms.user(user.id), ServerEvents.chatMessage, present(message, user.id));
  notifyAsync({
    userId: recipientId,
    type: 'CHAT_MESSAGE',
    title: isCustomer ? 'Message from customer' : 'Message from your rider',
    body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    data: { orderId },
  });
  return present(message, user.id);
}
