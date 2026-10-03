import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import type { AuthUser } from '../../middleware/auth';
import { emitTo, rooms, ServerEvents } from '../../realtime/io';
import { notifyAsync } from '../notifications/notification.service';
import { ANTI_SNIPE_MS } from './market.constants';
import { assertWithinLimit, auctionState, closeAuctionIfEnded, presentBid, publicName } from './market.service';

const usd = (cents: number) => formatMoney(cents, 'USD');

/** Bids per account per minute across all auctions, and on one auction (checked in the database). */
const MAX_BIDS_PER_MINUTE = 10;
const MAX_BIDS_PER_LISTING_PER_MINUTE = 5;

const recentBidsInclude = { bids: { orderBy: { createdAt: 'desc' as const }, take: 10, include: { bidder: { select: { id: true, name: true } } } } };

/** What everyone watching an auction sees after a bid or when it ends (no per-viewer details). */
async function broadcastState(listingId: string) {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { ...recentBidsInclude, soldTo: { select: { name: true } } } });
  if (!l) return;
  emitTo(rooms.listing(listingId), ServerEvents.listingBid, {
    listingId,
    status: l.status,
    auction: auctionState(l),
    bids: l.bids.map((b) => presentBid(b)),
    winnerName: l.status === 'SOLD' && l.soldTo ? publicName(l.soldTo.name) : null,
  });
}

/**
 * Places a bid. The listing row is locked so two bids can't both win, the bid must be at least
 * the next minimum, and a bid in the last two minutes pushes the end back to two minutes from now
 * (so nobody wins by bidding at the very last second).
 */
export async function placeBid(user: AuthUser, listingId: string, amountCents: number) {
  const minuteAgo = new Date(Date.now() - 60_000);
  const [mine, mineHere] = await Promise.all([
    prisma.bid.count({ where: { bidderId: user.id, createdAt: { gte: minuteAgo } } }),
    prisma.bid.count({ where: { bidderId: user.id, listingId, createdAt: { gte: minuteAgo } } }),
  ]);
  assertWithinLimit(mine, MAX_BIDS_PER_MINUTE, 'Too many bids. Wait a moment and try again.');
  assertWithinLimit(mineHere, MAX_BIDS_PER_LISTING_PER_MINUTE, 'You are bidding on this auction too fast. Wait a moment.');

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
    const l = await tx.listing.findUnique({ where: { id: listingId }, include: { seller: { include: { user: { select: { status: true } } } } } });
    if (!l || l.status === 'REMOVED' || l.seller.user.status !== 'ACTIVE') throw notFound('Listing');
    if (l.saleType !== 'AUCTION' || !l.auctionEndsAt) throw badRequest('This listing is not an auction.');
    if (l.seller.userId === user.id) throw forbidden("You can't bid on your own auction.");
    const now = new Date();
    if (l.status !== 'ACTIVE' || l.auctionClosedAt || l.auctionEndsAt <= now) throw conflict('This auction has ended.');
    if (l.highestBidderId === user.id) throw conflict('You are already the highest bidder.');
    const state = auctionState(l)!;
    if (amountCents < state.minNextBidCents) throw badRequest(`Bid at least ${usd(state.minNextBidCents)}.`);

    // Late bids extend the auction so others get a fair chance to answer.
    const extended = l.auctionEndsAt.getTime() - now.getTime() < ANTI_SNIPE_MS;
    const auctionEndsAt = extended ? new Date(now.getTime() + ANTI_SNIPE_MS) : l.auctionEndsAt;
    const bid = await tx.bid.create({ data: { listingId, bidderId: user.id, amountCents }, include: { bidder: { select: { id: true, name: true } } } });
    const updated = await tx.listing.update({
      where: { id: listingId },
      data: { currentBidCents: amountCents, bidCount: { increment: 1 }, highestBidderId: user.id, auctionEndsAt },
    });
    return { bid, updated, previousLeader: l.highestBidderId, sellerUserId: l.seller.userId, title: l.title, extended };
  });

  const { bid, updated, previousLeader, sellerUserId, title, extended } = result;
  if (previousLeader && previousLeader !== user.id) {
    notifyAsync({
      userId: previousLeader,
      type: 'MARKET_OUTBID',
      title: 'You have been outbid',
      body: `Someone bid ${usd(amountCents)} on “${title}”. Bid again before it ends.`,
      data: { listingId },
    });
  }
  notifyAsync({
    userId: sellerUserId,
    type: 'MARKET_BID',
    title: 'New bid on your auction',
    body: `${usd(amountCents)} on “${title}” (${updated.bidCount} bid${updated.bidCount === 1 ? '' : 's'}).`,
    data: { listingId },
  });
  await broadcastState(listingId);

  return { bid: presentBid(bid, user.id), auction: auctionState(updated), isHighestBidder: true, extended };
}

/**
 * Ends an auction whose time is up. Safe to call more than once and from several places at the
 * same time: the row is locked and only an open auction past its end time is closed.
 * With bids, the listing is sold to the highest bidder. Without bids it stays listed but out of
 * search, and the seller can start it again by choosing a new end time.
 */
export async function closeAuction(listingId: string) {
  const closed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
    const l = await tx.listing.findUnique({ where: { id: listingId }, include: { seller: { select: { userId: true } } } });
    const now = new Date();
    if (!l || l.saleType !== 'AUCTION' || l.status !== 'ACTIVE' || l.auctionClosedAt || !l.auctionEndsAt || l.auctionEndsAt > now) return null;

    // The leader's account may have been deleted since; the best remaining bid then wins.
    let winnerId = l.highestBidderId;
    let winningCents = l.currentBidCents;
    if (!winnerId && l.bidCount > 0) {
      const top = await tx.bid.findFirst({ where: { listingId }, orderBy: [{ amountCents: 'desc' }, { createdAt: 'asc' }] });
      winnerId = top?.bidderId ?? null;
      winningCents = top?.amountCents ?? null;
    }

    if (winnerId && winningCents !== null) {
      await tx.listing.update({
        where: { id: listingId },
        data: { status: 'SOLD', soldToId: winnerId, soldAt: now, auctionClosedAt: now, highestBidderId: winnerId, currentBidCents: winningCents },
      });
      // The winner and the seller get a chat to arrange payment and collection.
      await tx.listingThread.upsert({
        where: { listingId_buyerId: { listingId, buyerId: winnerId } },
        create: { listingId, buyerId: winnerId, sellerUserId: l.seller.userId },
        update: {},
      });
    } else {
      await tx.listing.update({ where: { id: listingId }, data: { auctionClosedAt: now } });
    }
    return { winnerId, winningCents, sellerUserId: l.seller.userId, title: l.title };
  });
  if (!closed) return null;

  const { winnerId, winningCents, sellerUserId, title } = closed;
  if (winnerId && winningCents !== null) {
    notifyAsync({
      userId: winnerId,
      type: 'MARKET_AUCTION_WON',
      title: 'You won the auction!',
      body: `“${title}” is yours for ${usd(winningCents)}. Message the seller to arrange payment and collection.`,
      data: { listingId },
      fallbackToSms: true,
    });
    notifyAsync({
      userId: sellerUserId,
      type: 'MARKET_AUCTION_ENDED',
      title: 'Your auction has ended',
      body: `“${title}” sold for ${usd(winningCents)}. Message the winner to arrange payment and collection.`,
      data: { listingId },
    });
  } else {
    notifyAsync({
      userId: sellerUserId,
      type: 'MARKET_AUCTION_ENDED',
      title: 'Your auction ended with no bids',
      body: `Nobody bid on “${title}”. Edit the listing to choose a new end time, or change it to a fixed price.`,
      data: { listingId },
    });
  }
  await broadcastState(listingId);
  return closed;
}

/** Scheduled job: closes every auction whose end time has passed. */
export async function closeEndedAuctions(): Promise<number> {
  const due = await prisma.listing.findMany({
    where: { saleType: 'AUCTION', status: 'ACTIVE', auctionClosedAt: null, auctionEndsAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { auctionEndsAt: 'asc' },
    take: 100,
  });
  let closed = 0;
  for (const { id } of due) {
    if (await closeAuction(id)) closed++;
  }
  return closed;
}

/** The live part of an auction, for clients that poll instead of using sockets. */
export async function getAuctionState(listingId: string, viewer?: AuthUser) {
  await closeAuctionIfEnded(listingId);
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { ...recentBidsInclude, soldTo: { select: { id: true, name: true } } } });
  if (!l || l.status === 'REMOVED') throw notFound('Listing');
  if (l.saleType !== 'AUCTION') throw badRequest('This listing is not an auction.');
  return {
    listingId,
    status: l.status,
    auction: auctionState(l),
    bids: l.bids.map((b) => presentBid(b, viewer?.id)),
    isHighestBidder: Boolean(viewer && l.highestBidderId === viewer.id),
    winner: l.status === 'SOLD' && l.soldTo ? { name: publicName(l.soldTo.name), isYou: l.soldTo.id === viewer?.id } : null,
    serverTime: new Date(),
  };
}
