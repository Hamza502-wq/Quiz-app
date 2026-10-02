import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { sendPush } from './push.provider';
import { sendMessage } from './sms.provider';
import { runInBackground } from '../../lib/background';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  /**
   * When true and push could not be delivered, fall back to the user's preferred
   * SMS/WhatsApp channel. Use for events the user must not miss.
   */
  fallbackToSms?: boolean;
}

/**
 * Stores an in-app notification, emits it over Socket.IO, sends a push
 * notification and — when push fails and `fallbackToSms` is set — an SMS or
 * WhatsApp message. Never throws: notification failures must not break flows.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { phone: true, notificationChannel: true, deviceTokens: { select: { token: true } } },
    });
    if (!user) return;

    const push = await sendPush(
      user.deviceTokens.map((d) => d.token),
      input.title,
      input.body,
      { type: input.type, ...(input.data ?? {}) },
    );
    if (push.invalidTokens.length) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: push.invalidTokens } } });
    }

    let channel: 'IN_APP' | 'PUSH' | 'SMS' | 'WHATSAPP' = push.delivered > 0 ? 'PUSH' : 'IN_APP';
    if (push.delivered === 0 && input.fallbackToSms) {
      const via = user.notificationChannel === 'WHATSAPP' ? 'WHATSAPP' : 'SMS';
      const sent = await sendMessage(user.phone, `DoorStep: ${input.body}`, via);
      if (sent) channel = via;
    }

    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        channel,
      },
    });
    emitTo(rooms.user(input.userId), ServerEvents.notification, notification);
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'Failed to deliver notification');
  }
}

/** Fire-and-forget wrapper for use inside request handlers. */
export function notifyAsync(input: NotifyInput): void {
  runInBackground(notify(input), 'notify');
}

export async function notifyAdmins(input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { roles: { some: { role: { name: 'ADMIN' } } }, status: 'ACTIVE' },
    select: { id: true },
  });
  await Promise.all(admins.map((a) => notify({ ...input, userId: a.id })));
}

export function notifyAdminsAsync(input: Omit<NotifyInput, 'userId'>): void {
  runInBackground(notifyAdmins(input), 'notify-admins');
}
