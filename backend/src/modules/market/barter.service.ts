import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import type { AuthUser } from '../../middleware/auth';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { notifyAsync } from '../notifications/notification.service';
import { assertWithinLimit, closeOffersFor, listingSummaryInclude, presentListingSummary, publicName } from './market.service';

/** Items in one offer, and offers (including counters) per account per hour. */
export const MAX_OFFER_ITEMS = 5;
const MAX_OFFERS_PER_HOUR = 20;

export interface OfferInput {
  itemIds: string[];
  cashCents: number;
  message?: string;
}

const offerInclude = {
  listing: { include: listingSummaryInclude },
  items: { include: { listing: { include: listingSummaryInclude } } },
  buyer: { select: { id: true, name: true } },
  sellerUser: { select: { id: true, sellerProfile: { select: { displayName: true } } } },
} satisfies Prisma.BarterOfferInclude;

type OfferRow = Prisma.BarterOfferGetPayload<{ include: typeof offerInclude }>;

function presentOffer(o: OfferRow, viewerId: string) {
  const mine = o.createdById === viewerId;
  const pending = o.status === 'PENDING';
  return {
    id: o.id,
    status: o.status,
    role: o.buyerId === viewerId ? ('buyer' as const) : ('seller' as const),
    madeBy: o.createdById === o.buyerId ? ('buyer' as const) : ('seller' as const),
    mine,
    canRespond: pending && !mine,
    canWithdraw: pending && mine,
    listing: presentListingSummary(o.listing),
    items: o.items.map((i) => presentListingSummary(i.listing)),
    cashCents: o.cashCents,
    message: o.message,
    buyerName: publicName(o.buyer.name, 'Buyer'),
    sellerName: o.sellerUser.sellerProfile?.displayName ?? 'Seller',
    parentId: o.parentId,
    createdAt: o.createdAt,
    respondedAt: o.respondedAt,
  };
}

export type PresentedOffer = ReturnType<typeof presentOffer>;

/** "2 items + US$20" — used in notifications. */
function describeOffer(itemCount: number, cashCents: number): string {
  const items = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  return cashCents > 0 ? `${items} + ${formatMoney(cashCents, 'USD')}` : items;
}

function emitOffer(o: OfferRow) {
  for (const userId of [o.buyerId, o.sellerUserId]) {
    emitTo(rooms.user(userId), ServerEvents.marketOffer, { offerId: o.id, listingId: o.listingId, status: o.status });
  }
}

async function assertOfferRate(userId: string) {
  const recent = await prisma.barterOffer.count({ where: { createdById: userId, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
  assertWithinLimit(recent, MAX_OFFERS_PER_HOUR, 'You have made a lot of offers. Try again in an hour.');
}

/** Offered items must be the buyer's own active, fixed-price listings. */
async function checkItems(tx: Prisma.TransactionClient, buyerId: string, itemIds: string[], targetId: string): Promise<string[]> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) throw badRequest('Choose at least one of your items to offer.');
  if (ids.length > MAX_OFFER_ITEMS) throw badRequest(`Offer up to ${MAX_OFFER_ITEMS} items.`);
  if (ids.includes(targetId)) throw badRequest("You can't offer the item you want.");
  const items = await tx.listing.findMany({
    where: { id: { in: ids }, status: 'ACTIVE', saleType: 'FIXED', seller: { userId: buyerId } },
    select: { id: true },
  });
  if (items.length !== ids.length) throw badRequest('Only your own listed items can be offered (not auctions or sold items).');
  return ids;
}

/** Locks the wanted listing and the offered items so a swap can't race a sale. */
async function lockListings(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM listings WHERE id = ${id} FOR UPDATE`;
}

async function loadOffer(user: AuthUser, offerId: string) {
  const o = await prisma.barterOffer.findUnique({ where: { id: offerId }, include: offerInclude });
  if (!o || (o.buyerId !== user.id && o.sellerUserId !== user.id)) throw notFound('Offer');
  return o;
}

/** A buyer offers one or more of their own items (plus optional cash) for a listing. */
export async function createOffer(user: AuthUser, listingId: string, input: OfferInput) {
  await assertOfferRate(user.id);
  const offerId = await prisma.$transaction(async (tx) => {
    await lockListings(tx, [listingId]);
    const listing = await tx.listing.findUnique({ where: { id: listingId }, include: { seller: { include: { user: { select: { status: true } } } } } });
    if (!listing || listing.status === 'REMOVED' || listing.seller.user.status !== 'ACTIVE') throw notFound('Listing');
    if (listing.seller.userId === user.id) throw forbidden("You can't make an offer on your own listing.");
    if (listing.status !== 'ACTIVE') throw conflict('This listing is no longer available.');
    if (listing.saleType !== 'FIXED' || !listing.openToBarter) throw conflict('This seller is not taking swaps for this listing.');
    const existing = await tx.barterOffer.findFirst({ where: { listingId, buyerId: user.id, status: 'PENDING' }, select: { id: true } });
    if (existing) throw conflict('You already have an offer waiting on this listing. Withdraw it to make a new one.');
    const itemIds = await checkItems(tx, user.id, input.itemIds, listingId);
    const offer = await tx.barterOffer.create({
      data: {
        listingId,
        buyerId: user.id,
        sellerUserId: listing.seller.userId,
        createdById: user.id,
        cashCents: input.cashCents,
        message: input.message ?? null,
        items: { create: itemIds.map((id) => ({ listingId: id })) },
      },
    });
    return offer.id;
  });

  const o = await prisma.barterOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  notifyAsync({
    userId: o.sellerUserId,
    type: 'MARKET_OFFER',
    title: 'New swap offer',
    body: `${publicName(o.buyer.name, 'A buyer')} offers ${describeOffer(o.items.length, o.cashCents)} for “${o.listing.title}”.`,
    data: { offerId: o.id, listingId: o.listingId },
  });
  emitOffer(o);
  return presentOffer(o, user.id);
}

/**
 * Answers an offer with a different one: which of the buyer's items, and how much cash.
 * The offer being answered becomes COUNTERED and the new one waits for the other side.
 */
export async function counterOffer(user: AuthUser, offerId: string, input: OfferInput) {
  const original = await loadOffer(user, offerId);
  if (original.status !== 'PENDING') throw conflict('This offer has already been answered.');
  if (original.createdById === user.id) throw forbidden('Wait for the other side to answer your offer.');
  await assertOfferRate(user.id);

  const newId = await prisma.$transaction(async (tx) => {
    await lockListings(tx, [original.listingId]);
    const listing = await tx.listing.findUnique({ where: { id: original.listingId } });
    if (!listing || listing.status !== 'ACTIVE' || listing.saleType !== 'FIXED' || !listing.openToBarter) {
      throw conflict('This listing is no longer available for swaps.');
    }
    const itemIds = await checkItems(tx, original.buyerId, input.itemIds, original.listingId);
    const answered = await tx.barterOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'COUNTERED', respondedAt: new Date() } });
    if (answered.count !== 1) throw conflict('This offer has already been answered.');
    const counter = await tx.barterOffer.create({
      data: {
        listingId: original.listingId,
        buyerId: original.buyerId,
        sellerUserId: original.sellerUserId,
        createdById: user.id,
        cashCents: input.cashCents,
        message: input.message ?? null,
        parentId: offerId,
        items: { create: itemIds.map((id) => ({ listingId: id })) },
      },
    });
    return counter.id;
  });

  const o = await prisma.barterOffer.findUniqueOrThrow({ where: { id: newId }, include: offerInclude });
  const fromSeller = user.id === o.sellerUserId;
  notifyAsync({
    userId: fromSeller ? o.buyerId : o.sellerUserId,
    type: 'MARKET_OFFER',
    title: 'Counter offer',
    body: `${fromSeller ? o.sellerUser.sellerProfile?.displayName ?? 'The seller' : publicName(o.buyer.name, 'The buyer')} asks for ${describeOffer(o.items.length, o.cashCents)} for “${o.listing.title}”.`,
    data: { offerId: o.id, listingId: o.listingId },
  });
  emitOffer(o);
  return presentOffer(o, user.id);
}

/**
 * Accepts an offer: the wanted listing goes to the buyer, the offered items go to the seller, and
 * every other open offer involving these items is closed. The two get a chat to arrange the swap.
 */
export async function acceptOffer(user: AuthUser, offerId: string) {
  const offer = await loadOffer(user, offerId);
  if (offer.status !== 'PENDING') throw conflict('This offer has already been answered.');
  if (offer.createdById === user.id) throw forbidden('Wait for the other side to answer your offer.');
  const itemIds = offer.items.map((i) => i.listingId);

  const threadId = await prisma.$transaction(async (tx) => {
    await lockListings(tx, [offer.listingId, ...itemIds]);
    const listing = await tx.listing.findUnique({ where: { id: offer.listingId } });
    if (!listing || listing.status !== 'ACTIVE' || listing.saleType !== 'FIXED' || !listing.openToBarter) {
      throw conflict('This listing is no longer available for swaps.');
    }
    const available = await tx.listing.count({
      where: { id: { in: itemIds }, status: 'ACTIVE', saleType: 'FIXED', seller: { userId: offer.buyerId } },
    });
    if (available !== itemIds.length) throw conflict('One of the offered items is no longer available.');
    const accepted = await tx.barterOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    if (accepted.count !== 1) throw conflict('This offer has already been answered.');
    const now = new Date();
    await tx.listing.update({ where: { id: offer.listingId }, data: { status: 'SOLD', soldToId: offer.buyerId, soldAt: now } });
    await tx.listing.updateMany({ where: { id: { in: itemIds } }, data: { status: 'SOLD', soldToId: offer.sellerUserId, soldAt: now } });
    const thread = await tx.listingThread.upsert({
      where: { listingId_buyerId: { listingId: offer.listingId, buyerId: offer.buyerId } },
      create: { listingId: offer.listingId, buyerId: offer.buyerId, sellerUserId: offer.sellerUserId },
      update: {},
    });
    return thread.id;
  });

  await closeOffersFor([offer.listingId, ...itemIds], { exceptOfferId: offerId });
  const o = await prisma.barterOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  notifyAsync({
    userId: o.createdById,
    type: 'MARKET_OFFER',
    title: 'Swap offer accepted!',
    body: `Your offer for “${o.listing.title}” was accepted. Message each other to arrange the swap.`,
    data: { offerId: o.id, listingId: o.listingId, threadId },
    fallbackToSms: true,
  });
  emitOffer(o);
  return { ...presentOffer(o, user.id), threadId };
}

export async function declineOffer(user: AuthUser, offerId: string) {
  const offer = await loadOffer(user, offerId);
  if (offer.createdById === user.id) throw forbidden('To cancel your own offer, withdraw it.');
  const res = await prisma.barterOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } });
  if (res.count !== 1) throw conflict('This offer has already been answered.');
  const o = await prisma.barterOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  notifyAsync({
    userId: o.createdById,
    type: 'MARKET_OFFER',
    title: 'Swap offer declined',
    body: `Your offer for “${o.listing.title}” was declined.`,
    data: { offerId: o.id, listingId: o.listingId },
  });
  emitOffer(o);
  return presentOffer(o, user.id);
}

export async function withdrawOffer(user: AuthUser, offerId: string) {
  const offer = await loadOffer(user, offerId);
  if (offer.createdById !== user.id) throw forbidden('Only the person who made an offer can withdraw it. You can decline it.');
  const res = await prisma.barterOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
  if (res.count !== 1) throw conflict('This offer has already been answered.');
  const o = await prisma.barterOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  notifyAsync({
    userId: o.createdById === o.buyerId ? o.sellerUserId : o.buyerId,
    type: 'MARKET_OFFER',
    title: 'Swap offer withdrawn',
    body: `An offer for “${o.listing.title}” was withdrawn.`,
    data: { offerId: o.id, listingId: o.listingId },
  });
  emitOffer(o);
  return presentOffer(o, user.id);
}

/** Every offer this person made or received, newest first. */
export async function listOffers(user: AuthUser) {
  const rows = await prisma.barterOffer.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerUserId: user.id }] },
    include: offerInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((o) => presentOffer(o, user.id));
}

/** One offer with the earlier offers it answered (oldest first). */
export async function getOffer(user: AuthUser, offerId: string) {
  const o = await loadOffer(user, offerId);
  const history: PresentedOffer[] = [];
  let parentId = o.parentId;
  for (let i = 0; parentId && i < 10; i++) {
    const parent = await prisma.barterOffer.findUnique({ where: { id: parentId }, include: offerInclude });
    if (!parent) break;
    history.unshift(presentOffer(parent, user.id));
    parentId = parent.parentId;
  }
  return { ...presentOffer(o, user.id), history };
}

/** Items the buyer could put in an offer: their own active fixed-price listings. */
export async function swappableItems(buyerUserId: string) {
  const rows = await prisma.listing.findMany({
    where: { status: 'ACTIVE', saleType: 'FIXED', seller: { userId: buyerUserId } },
    include: listingSummaryInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((l) => presentListingSummary(l));
}

/** For a counter offer: the buyer's items, visible only to the two people in the offer. */
export async function offerBuyerItems(user: AuthUser, offerId: string) {
  const o = await loadOffer(user, offerId);
  return swappableItems(o.buyerId);
}
