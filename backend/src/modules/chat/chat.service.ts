import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { notifyAsync } from '../notifications/notification.service';
import { TERMINAL_STATUSES } from '../orders/order.presenter';

export type ChatRole = 'customer' | 'store' | 'rider';

interface Participant {
  userId: string;
  role: ChatRole;
  name: string;
}

/**
 * One chat per order, shared by the customer, the store (for store orders) and the assigned
 * rider. Admins can read it.
 */
async function loadChat(user: AuthUser, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { userId: true, user: { select: { name: true } } } },
      vendor: { select: { userId: true, name: true } },
      rider: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  if (!order) throw notFound('Order');
  const participants: Participant[] = [{ userId: order.customer.userId, role: 'customer', name: order.customer.user.name ?? 'Customer' }];
  if (order.vendor) participants.push({ userId: order.vendor.userId, role: 'store', name: order.vendor.name });
  if (order.rider) participants.push({ userId: order.rider.userId, role: 'rider', name: order.rider.user.name ?? 'Rider' });
  const me = participants.find((p) => p.userId === user.id) ?? null;
  if (!me && !user.roles.includes('ADMIN')) throw notFound('Order');
  return { order, participants, me };
}

type ChatMessageRow = { id: string; orderId: string; senderId: string; body: string; createdAt: Date; readAt: Date | null };

function present(m: ChatMessageRow, viewerId: string, participants: Participant[]) {
  const sender = participants.find((p) => p.userId === m.senderId);
  return {
    id: m.id,
    orderId: m.orderId,
    body: m.body,
    createdAt: m.createdAt,
    readAt: m.readAt,
    mine: m.senderId === viewerId,
    senderId: m.senderId,
    // Someone no longer on the order (a rider who handed it back) shows as a former rider.
    sender: sender ? { role: sender.role, name: sender.name } : { role: 'rider' as const, name: 'Former rider' },
  };
}

export async function listMessages(user: AuthUser, orderId: string) {
  const { participants } = await loadChat(user, orderId);
  // Taken before reading, so a message arriving meanwhile still counts as unread next time.
  const now = new Date();
  const messages = await prisma.chatMessage.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, take: 500 });
  await prisma.$transaction([
    prisma.chatMessage.updateMany({ where: { orderId, senderId: { not: user.id }, readAt: null }, data: { readAt: now } }),
    prisma.chatRead.upsert({
      where: { orderId_userId: { orderId, userId: user.id } },
      create: { orderId, userId: user.id, readAt: now },
      update: { readAt: now },
    }),
  ]);
  return messages.map((m) => present(m, user.id, participants));
}

/** Messages from others on each of these orders that this person hasn't opened the chat to see. */
export async function unreadMessageCounts(userId: string, orderIds: string[]): Promise<Record<string, number>> {
  if (orderIds.length === 0) return {};
  const reads = await prisma.chatRead.findMany({ where: { userId, orderId: { in: orderIds } } });
  const readAt = new Map(reads.map((r) => [r.orderId, r.readAt]));
  const counts = await Promise.all(
    orderIds.map((orderId) =>
      prisma.chatMessage.count({
        where: { orderId, senderId: { not: userId }, ...(readAt.has(orderId) ? { createdAt: { gt: readAt.get(orderId) } } : {}) },
      }),
    ),
  );
  return Object.fromEntries(orderIds.map((id, i) => [id, counts[i]]));
}

export async function sendMessage(user: AuthUser, orderId: string, body: string) {
  const { order, participants, me } = await loadChat(user, orderId);
  if (!me) throw conflict('Only the customer, the store and the rider can chat on an order.');
  if (order.status === 'PENDING_PAYMENT') throw conflict('Chat opens once the order is placed.');
  if (TERMINAL_STATUSES.includes(order.status)) throw conflict('This order is closed.');
  const recipients = participants.filter((p) => p.userId !== me.userId);
  if (recipients.length === 0) throw conflict('Chat opens once a rider is assigned.');

  const message = await prisma.chatMessage.create({ data: { orderId, senderId: user.id, body } });
  for (const p of [me, ...recipients]) emitTo(rooms.user(p.userId), ServerEvents.chatMessage, present(message, p.userId, participants));
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  for (const r of recipients) {
    notifyAsync({
      userId: r.userId,
      type: 'CHAT_MESSAGE',
      title: `${messageFrom(me, r)} · ${order.code}`,
      body: preview,
      data: { orderId },
    });
  }
  return present(message, user.id, participants);
}

/** "Message from your rider", "Message from Sadza Republic", … as the recipient sees it. */
function messageFrom(sender: Participant, recipient: Participant): string {
  if (sender.role === 'store') return `Message from ${sender.name}`;
  if (sender.role === 'rider') return recipient.role === 'customer' ? 'Message from your rider' : `Message from rider ${sender.name}`;
  return recipient.role === 'store' ? `Message from customer ${sender.name}` : 'Message from the customer';
}
