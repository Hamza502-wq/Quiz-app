import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, forbidden, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { notifyAsync } from '../notifications/notification.service';
import { assertWithinLimit, publicName } from './market.service';

/** Messages per account per minute, and new conversations per account per hour (database-backed). */
const MAX_MESSAGES_PER_MINUTE = 15;
const MAX_NEW_THREADS_PER_HOUR = 10;

const threadInclude = {
  listing: {
    select: {
      id: true,
      title: true,
      status: true,
      priceCents: true,
      saleType: true,
      currentBidCents: true,
      photos: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { url: true, thumbUrl: true } },
    },
  },
  buyer: { select: { id: true, name: true, avatarUrl: true } },
  sellerUser: { select: { id: true, avatarUrl: true, sellerProfile: { select: { id: true, displayName: true } } } },
} satisfies Prisma.ListingThreadInclude;

type ThreadRow = Prisma.ListingThreadGetPayload<{ include: typeof threadInclude }>;
type MessageRow = { id: string; threadId: string; senderId: string; body: string; createdAt: Date };

function presentThread(t: ThreadRow, viewerId: string) {
  const isBuyer = t.buyerId === viewerId;
  const photo = t.listing.photos[0];
  return {
    id: t.id,
    role: isBuyer ? ('buyer' as const) : ('seller' as const),
    listing: {
      id: t.listing.id,
      title: t.listing.title,
      status: t.listing.status,
      saleType: t.listing.saleType,
      priceCents: t.listing.saleType === 'AUCTION' ? (t.listing.currentBidCents ?? t.listing.priceCents) : t.listing.priceCents,
      thumbUrl: photo?.thumbUrl ?? photo?.url ?? null,
    },
    other: isBuyer
      ? { name: t.sellerUser.sellerProfile?.displayName ?? 'Seller', avatarUrl: t.sellerUser.avatarUrl, sellerId: t.sellerUser.sellerProfile?.id ?? null }
      : { name: publicName(t.buyer.name, 'Buyer'), avatarUrl: t.buyer.avatarUrl, sellerId: null },
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
  };
}

function presentMessage(m: MessageRow, viewerId: string) {
  return { id: m.id, threadId: m.threadId, body: m.body, createdAt: m.createdAt, mine: m.senderId === viewerId };
}

async function loadThread(user: AuthUser, threadId: string) {
  const t = await prisma.listingThread.findUnique({ where: { id: threadId }, include: threadInclude });
  // Only the two people in a conversation can see it.
  if (!t || (t.buyerId !== user.id && t.sellerUserId !== user.id)) throw notFound('Conversation');
  return t;
}

/** Unread messages per conversation for this person (messages from the other side since they last opened it). */
export async function unreadCounts(userId: string, threadIds?: string[]): Promise<Record<string, number>> {
  if (threadIds && threadIds.length === 0) return {};
  const onlyThese = threadIds ? Prisma.sql`AND t.id IN (${Prisma.join(threadIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string; unread: bigint | number }>>(Prisma.sql`
    SELECT t.id, COUNT(m.id) AS unread
    FROM listing_threads t
    JOIN listing_messages m ON m.thread_id = t.id AND m.sender_id <> ${userId}
    WHERE (t.buyer_id = ${userId} OR t.seller_user_id = ${userId}) ${onlyThese}
      AND m.created_at > COALESCE(CASE WHEN t.buyer_id = ${userId} THEN t.buyer_read_at ELSE t.seller_read_at END, 'epoch'::timestamp)
    GROUP BY t.id`);
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.unread)]));
}

export async function unreadTotal(userId: string): Promise<{ unread: number }> {
  const counts = await unreadCounts(userId);
  return { unread: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export async function listThreads(user: AuthUser) {
  const threads = await prisma.listingThread.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerUserId: user.id }] },
    include: { ...threadInclude, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });
  const unread = await unreadCounts(
    user.id,
    threads.map((t) => t.id),
  );
  return threads.map((t) => ({
    ...presentThread(t, user.id),
    lastMessage: t.messages[0] ? presentMessage(t.messages[0], user.id) : null,
    unread: unread[t.id] ?? 0,
  }));
}

/**
 * A conversation and its messages; opening it marks the other side's messages as read.
 * With `after`, only messages newer than that time are returned (for polling).
 */
export async function getThread(user: AuthUser, threadId: string, after?: Date) {
  const t = await loadThread(user, threadId);
  // Taken before reading, so a message arriving meanwhile still counts as unread next time.
  const now = new Date();
  const messages = after
    ? await prisma.listingMessage.findMany({ where: { threadId, createdAt: { gt: after } }, orderBy: { createdAt: 'asc' }, take: 200 })
    : (await prisma.listingMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'desc' }, take: 200 })).reverse();
  await prisma.listingThread.update({
    where: { id: threadId },
    data: t.buyerId === user.id ? { buyerReadAt: now } : { sellerReadAt: now },
  });
  return { thread: presentThread(t, user.id), messages: messages.map((m) => presentMessage(m, user.id)) };
}

async function assertCanSend(userId: string) {
  const recent = await prisma.listingMessage.count({ where: { senderId: userId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  assertWithinLimit(recent, MAX_MESSAGES_PER_MINUTE, 'You are sending messages too fast. Wait a moment and try again.');
}

async function deliver(t: ThreadRow, sender: AuthUser, body: string) {
  const now = new Date();
  const isBuyer = t.buyerId === sender.id;
  const [message] = await prisma.$transaction([
    prisma.listingMessage.create({ data: { threadId: t.id, senderId: sender.id, body } }),
    prisma.listingThread.update({
      where: { id: t.id },
      data: { lastMessageAt: now, ...(isBuyer ? { buyerReadAt: now } : { sellerReadAt: now }) },
    }),
  ]);
  const recipientId = isBuyer ? t.sellerUserId : t.buyerId;
  emitTo(rooms.user(sender.id), ServerEvents.marketMessage, presentMessage(message, sender.id));
  emitTo(rooms.user(recipientId), ServerEvents.marketMessage, presentMessage(message, recipientId));
  const from = isBuyer ? publicName(t.buyer.name, 'A buyer') : (t.sellerUser.sellerProfile?.displayName ?? 'The seller');
  notifyAsync({
    userId: recipientId,
    type: 'MARKET_MESSAGE',
    title: `${from} · ${t.listing.title.slice(0, 40)}`,
    body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    data: { threadId: t.id, listingId: t.listing.id },
  });
  return presentMessage(message, sender.id);
}

/**
 * Messages the seller about a listing, opening the conversation if this is the first message.
 * New conversations need an active listing (or the buyer who won it at auction).
 */
export async function messageSeller(user: AuthUser, listingId: string, body: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { seller: { select: { userId: true, user: { select: { status: true } } } } },
  });
  if (!listing || listing.status === 'REMOVED' || listing.seller.user.status !== 'ACTIVE') throw notFound('Listing');
  if (listing.seller.userId === user.id) throw forbidden('This is your own listing. Buyers message you from it.');
  await assertCanSend(user.id);

  let thread = await prisma.listingThread.findUnique({ where: { listingId_buyerId: { listingId, buyerId: user.id } }, include: threadInclude });
  if (!thread) {
    if (listing.status !== 'ACTIVE' && listing.soldToId !== user.id) throw conflict('This listing is no longer available.');
    const opened = await prisma.listingThread.count({ where: { buyerId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
    assertWithinLimit(opened, MAX_NEW_THREADS_PER_HOUR, 'You have started a lot of conversations. Try again in an hour.');
    thread = await prisma.listingThread.upsert({
      where: { listingId_buyerId: { listingId, buyerId: user.id } },
      create: { listingId, buyerId: user.id, sellerUserId: listing.seller.userId },
      update: {},
      include: threadInclude,
    });
  }
  const message = await deliver(thread, user, body);
  return { threadId: thread.id, message };
}

export async function sendThreadMessage(user: AuthUser, threadId: string, body: string) {
  const t = await loadThread(user, threadId);
  if (t.listing.status === 'REMOVED') throw conflict('This listing was removed, so the conversation is closed.');
  await assertCanSend(user.id);
  return deliver(t, user, body);
}
