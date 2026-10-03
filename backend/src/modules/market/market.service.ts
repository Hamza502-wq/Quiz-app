import type { Listing, ListingCondition, ListingKind, Prisma, SaleType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../../lib/errors';
import { haversineKm, type LatLng } from '../../lib/geo';
import { formatMoney } from '../../lib/money';
import { runInBackground } from '../../lib/background';
import type { AuthUser } from '../../middleware/auth';
import { notifyAsync } from '../notifications/notification.service';
import { ownPublicUpload } from '../uploads/upload.service';
import {
  MARKET_CATEGORIES,
  MAX_ACTIVE_LISTINGS,
  MAX_LISTING_PHOTOS,
  MAX_SAVED_SEARCHES,
  SHONA_TO_ENGLISH,
  bidIncrementCents,
  findCategory,
} from './market.constants';
import { EMPTY_FILTERS, describeFilters, type SearchFilters } from './query-parser';
import { interpretQuery } from './ai-search';

// ───────────────────────────── Helpers ─────────────────────────────

/** Throws 429 when an action already happened `max` times in the window (works across instances). */
export function assertWithinLimit(count: number, max: number, message: string): void {
  if (count >= max) throw tooMany(message);
}

/** Lower-case words of a listing (with English for Shona words), padded so searches match whole-word prefixes. */
export function buildSearchText(parts: Array<string | null | undefined>, categorySlug: string): string {
  const category = findCategory(categorySlug);
  const words = [...parts, category?.name, category?.shona]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  const extra = words.map((word) => SHONA_TO_ENGLISH[word]).filter(Boolean);
  return ` ${[...words, ...extra].join(' ')} `;
}

/** A keyword matches a whole word, or the start of one for words of 4+ letters ("phone" → "phones"). */
function keywordPattern(keyword: string): string {
  const k = keyword.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').trim();
  return k.length <= 3 ? ` ${k} ` : ` ${k}`;
}

/** "Tatenda Moyo" → "Tatenda M." (bidder names are public). */
export function publicName(name: string | null | undefined, fallback = 'DoorStep user'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Uploads come with a small copy next to them ("<id>-sm.webp"). */
const thumbOf = (url: string) => (url.endsWith('-sm.webp') ? url : url.replace(/\.webp$/, '-sm.webp'));

// ───────────────────────────── Presenters ─────────────────────────────

export const listingSummaryInclude = {
  photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
  seller: { select: { id: true, userId: true, displayName: true, area: true, city: true, user: { select: { avatarUrl: true } } } },
} satisfies Prisma.ListingInclude;

type ListingWithSummary = Prisma.ListingGetPayload<{ include: typeof listingSummaryInclude }>;

/** Live auction numbers. `ended` is true once the end time has passed, even before closing. */
export function auctionState(l: Pick<Listing, 'saleType' | 'priceCents' | 'currentBidCents' | 'bidCount' | 'auctionEndsAt' | 'auctionClosedAt' | 'status'>) {
  if (l.saleType !== 'AUCTION' || !l.auctionEndsAt) return null;
  const ended = l.auctionEndsAt.getTime() <= Date.now() || l.auctionClosedAt !== null;
  return {
    startingPriceCents: l.priceCents,
    currentBidCents: l.currentBidCents,
    bidCount: l.bidCount,
    endsAt: l.auctionEndsAt,
    ended,
    minNextBidCents: l.currentBidCents === null ? l.priceCents : l.currentBidCents + bidIncrementCents(l.currentBidCents),
  };
}

/** What a listing costs now: the price, or the current bid of an auction. */
export function effectivePriceCents(l: Pick<Listing, 'priceCents' | 'saleType' | 'currentBidCents'>): number {
  return l.saleType === 'AUCTION' ? (l.currentBidCents ?? l.priceCents) : l.priceCents;
}

export function presentListingSummary(l: ListingWithSummary, origin?: LatLng | null) {
  const photo = l.photos[0];
  return {
    id: l.id,
    title: l.title,
    kind: l.kind,
    category: l.category,
    categoryName: findCategory(l.category)?.name ?? l.category,
    condition: l.condition,
    priceCents: l.priceCents,
    saleType: l.saleType,
    openToBarter: l.openToBarter,
    status: l.status,
    area: l.area,
    city: l.city,
    photoUrl: photo?.url ?? null,
    thumbUrl: photo?.thumbUrl ?? photo?.url ?? null,
    distanceKm: origin ? Math.round(haversineKm(origin, { lat: l.lat, lng: l.lng }) * 10) / 10 : null,
    createdAt: l.createdAt,
    auction: auctionState(l),
    seller: { id: l.seller.id, displayName: l.seller.displayName, avatarUrl: l.seller.user.avatarUrl },
  };
}

export type ListingSummary = ReturnType<typeof presentListingSummary>;

// ───────────────────────────── Seller profiles ─────────────────────────────

export interface SellerInput {
  displayName: string;
  bio?: string | null;
  area: string;
  city: string;
  lat: number;
  lng: number;
  whatsappPhone?: string | null;
  showWhatsapp?: boolean;
}

function presentSellerOwn(p: Prisma.SellerProfileGetPayload<{ include: { user: { select: { phone: true; avatarUrl: true } } } }>) {
  return {
    id: p.id,
    displayName: p.displayName,
    bio: p.bio,
    area: p.area,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    whatsappPhone: p.whatsappPhone,
    accountPhone: p.user.phone,
    showWhatsapp: p.showWhatsapp,
    avatarUrl: p.user.avatarUrl,
    createdAt: p.createdAt,
  };
}

export async function getMySeller(userId: string) {
  const p = await prisma.sellerProfile.findUnique({ where: { userId }, include: { user: { select: { phone: true, avatarUrl: true } } } });
  return p ? presentSellerOwn(p) : null;
}

export async function upsertSeller(userId: string, input: SellerInput) {
  const data = {
    displayName: input.displayName,
    bio: input.bio ?? null,
    area: input.area,
    city: input.city,
    lat: input.lat,
    lng: input.lng,
    whatsappPhone: input.whatsappPhone ?? null,
    showWhatsapp: input.showWhatsapp ?? true,
  };
  const p = await prisma.sellerProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    include: { user: { select: { phone: true, avatarUrl: true } } },
  });
  return presentSellerOwn(p);
}

export async function requireSeller(userId: string) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw conflict('Set up your seller profile first (your shop name and area).');
  return seller;
}

// ───────────────────────────── Listings ─────────────────────────────

export interface ListingInput {
  kind: ListingKind;
  title: string;
  description: string;
  category: string;
  condition?: ListingCondition | null;
  priceCents: number;
  saleType: SaleType;
  auctionEndsAt?: Date | null;
  openToBarter: boolean;
  photos: string[];
  area?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

const AUCTION_MIN_MS = 5 * 60_000;
const AUCTION_MAX_MS = 14 * 24 * 60 * 60_000;

function checkAuctionEnd(endsAt: Date | null | undefined): Date {
  if (!endsAt) throw badRequest('Choose when the auction ends.');
  const ms = endsAt.getTime() - Date.now();
  if (ms < AUCTION_MIN_MS) throw badRequest('An auction must run for at least 5 minutes.');
  if (ms > AUCTION_MAX_MS) throw badRequest('An auction can run for up to 14 days.');
  return endsAt;
}

/** Photos must be marketplace uploads made through this API. */
async function checkPhotos(urls: string[], kind: ListingKind): Promise<string[]> {
  const unique = [...new Set(urls)];
  if (unique.length > MAX_LISTING_PHOTOS) throw badRequest(`Add up to ${MAX_LISTING_PHOTOS} photos.`);
  if (kind === 'ITEM' && unique.length === 0) throw badRequest('Add at least one photo of the item.');
  for (const url of unique) {
    if (!(await ownPublicUpload(url, 'listing'))) throw badRequest('Upload photos from the app (one of the photos is not a DoorStep upload).');
  }
  return unique;
}

/** Auctions start from at least US$1; fixed prices may be 0 (free, or price on request for services). */
function checkPrice(priceCents: number, saleType: SaleType) {
  if (saleType === 'AUCTION' && priceCents < 100) throw badRequest('An auction must start at US$1 or more.');
}

function checkKindFields(input: Pick<ListingInput, 'kind' | 'category' | 'condition' | 'saleType' | 'openToBarter'>) {
  const category = findCategory(input.category);
  if (!category) throw badRequest('Choose one of the listed categories.');
  if (category.kind !== input.kind) {
    throw badRequest(input.kind === 'SERVICE' ? 'Choose a service category.' : 'Choose a category for items.');
  }
  if (input.kind === 'ITEM' && !input.condition) throw badRequest('Say what condition the item is in.');
  if (input.kind === 'SERVICE' && input.saleType === 'AUCTION') throw badRequest('Services are listed at a fixed price.');
  if (input.saleType === 'AUCTION' && input.openToBarter) throw badRequest('Auctions take bids, not swaps.');
}

export async function createListing(userId: string, input: ListingInput) {
  const seller = await requireSeller(userId);
  checkKindFields(input);
  checkPrice(input.priceCents, input.saleType);
  const [active, today] = await Promise.all([
    prisma.listing.count({ where: { sellerId: seller.id, status: 'ACTIVE' } }),
    prisma.listing.count({ where: { sellerId: seller.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } }),
  ]);
  assertWithinLimit(active, MAX_ACTIVE_LISTINGS, `You can have up to ${MAX_ACTIVE_LISTINGS} listings at once. Mark some as sold or delete them.`);
  assertWithinLimit(today, 30, 'You have posted 30 listings today. Try again tomorrow.');
  const photos = await checkPhotos(input.photos, input.kind);
  const auctionEndsAt = input.saleType === 'AUCTION' ? checkAuctionEnd(input.auctionEndsAt) : null;
  const area = input.area ?? seller.area;
  const city = input.city ?? seller.city;

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      category: input.category,
      condition: input.kind === 'ITEM' ? input.condition : null,
      priceCents: input.priceCents,
      saleType: input.saleType,
      openToBarter: input.saleType === 'FIXED' && input.openToBarter,
      auctionEndsAt,
      area,
      city,
      lat: input.lat ?? seller.lat,
      lng: input.lng ?? seller.lng,
      searchText: buildSearchText([input.title, input.description, area, city], input.category),
      photos: { create: photos.map((url, i) => ({ url, thumbUrl: thumbOf(url), sortOrder: i })) },
    },
  });
  runInBackground(notifyWatchers(listing.id), 'market-alerts');
  return getListingDetail(listing.id, { id: userId } as AuthUser);
}

async function ownListing(userId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { seller: true } });
  if (!listing || listing.status === 'REMOVED') throw notFound('Listing');
  if (listing.seller.userId !== userId) throw forbidden('Only the seller can change this listing.');
  return listing;
}

export async function updateListing(userId: string, listingId: string, input: Partial<ListingInput>) {
  const listing = await ownListing(userId, listingId);
  if (listing.status !== 'ACTIVE') throw conflict('Relist the item before editing it.');
  const merged = {
    kind: input.kind ?? listing.kind,
    category: input.category ?? listing.category,
    condition: input.condition === undefined ? listing.condition : input.condition,
    saleType: input.saleType ?? listing.saleType,
    openToBarter: input.openToBarter ?? listing.openToBarter,
  };
  checkKindFields(merged);

  const hasBids = listing.bidCount > 0;
  const priceChanged = input.priceCents !== undefined && input.priceCents !== listing.priceCents;
  const typeChanged = merged.saleType !== listing.saleType;
  const endChanged = input.auctionEndsAt !== undefined && input.auctionEndsAt?.getTime() !== listing.auctionEndsAt?.getTime();
  if (hasBids && (priceChanged || typeChanged || endChanged)) {
    throw conflict('People have bid on this auction, so its price and end time can no longer change.');
  }
  if (typeChanged) {
    const pending = await prisma.barterOffer.count({ where: { listingId, status: 'PENDING' } });
    if (pending > 0) throw conflict('Answer the swap offers on this listing before turning it into an auction.');
  }
  checkPrice(input.priceCents ?? listing.priceCents, merged.saleType);
  const barterSwitchedOff = listing.openToBarter && !(merged.saleType === 'FIXED' && merged.openToBarter);

  let auctionEndsAt: Date | null = listing.auctionEndsAt;
  let auctionClosedAt: Date | null = listing.auctionClosedAt;
  if (merged.saleType === 'AUCTION') {
    if (typeChanged || endChanged) {
      auctionEndsAt = checkAuctionEnd(input.auctionEndsAt ?? null);
      auctionClosedAt = null; // a no-bid auction that ended can be started again
    }
  } else {
    auctionEndsAt = null;
    auctionClosedAt = null;
  }

  const photos = input.photos ? await checkPhotos(input.photos, merged.kind) : null;
  const title = input.title ?? listing.title;
  const description = input.description ?? listing.description;
  const area = input.area ?? listing.area;
  const city = input.city ?? listing.city;

  await prisma.$transaction(async (tx) => {
    await tx.listing.update({
      where: { id: listingId },
      data: {
        kind: merged.kind,
        title,
        description,
        category: merged.category,
        condition: merged.kind === 'ITEM' ? merged.condition : null,
        priceCents: input.priceCents ?? listing.priceCents,
        saleType: merged.saleType,
        openToBarter: merged.saleType === 'FIXED' && merged.openToBarter,
        auctionEndsAt,
        auctionClosedAt,
        area,
        city,
        lat: input.lat ?? listing.lat,
        lng: input.lng ?? listing.lng,
        searchText: buildSearchText([title, description, area, city], merged.category),
      },
    });
    if (photos) {
      await tx.listingPhoto.deleteMany({ where: { listingId } });
      await tx.listingPhoto.createMany({ data: photos.map((url, i) => ({ listingId, url, thumbUrl: thumbOf(url), sortOrder: i })) });
    }
  });
  if (barterSwitchedOff) await closeOffersFor([listingId], { wantedOnly: true });
  return getListingDetail(listingId, { id: userId } as AuthUser);
}

/**
 * Declines pending swap offers for these listings: offers for them and offers that include
 * them as an offered item (or, with `wantedOnly`, only offers for them).
 */
export async function closeOffersFor(listingIds: string[], opts: { exceptOfferId?: string; wantedOnly?: boolean } = {}) {
  if (listingIds.length === 0) return;
  const offers = await prisma.barterOffer.findMany({
    where: {
      status: 'PENDING',
      id: opts.exceptOfferId ? { not: opts.exceptOfferId } : undefined,
      OR: opts.wantedOnly
        ? [{ listingId: { in: listingIds } }]
        : [{ listingId: { in: listingIds } }, { items: { some: { listingId: { in: listingIds } } } }],
    },
    include: { listing: { select: { title: true } } },
  });
  if (offers.length === 0) return;
  await prisma.barterOffer.updateMany({ where: { id: { in: offers.map((o) => o.id) }, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } });
  for (const o of offers) {
    notifyAsync({
      userId: o.createdById,
      type: 'MARKET_OFFER',
      title: 'Swap offer closed',
      body: opts.wantedOnly
        ? `Your swap offer for “${o.listing.title}” was closed: the seller no longer takes swaps for it.`
        : `Your swap offer for “${o.listing.title}” was closed because an item in it is no longer available.`,
      data: { offerId: o.id, listingId: o.listingId },
    });
  }
}

export async function markSold(userId: string, listingId: string) {
  const listing = await ownListing(userId, listingId);
  if (listing.status !== 'ACTIVE') throw conflict('This listing is not active.');
  if (listing.saleType === 'AUCTION' && listing.bidCount > 0) throw conflict('Auctions with bids end on their own and go to the highest bidder.');
  // Conditional, so a swap being accepted at the same moment can't be overwritten.
  const res = await prisma.listing.updateMany({ where: { id: listingId, status: 'ACTIVE' }, data: { status: 'SOLD', soldAt: new Date() } });
  if (res.count !== 1) throw conflict('This listing is not active.');
  await closeOffersFor([listingId]);
  return getListingDetail(listingId, { id: userId } as AuthUser);
}

export async function relist(userId: string, listingId: string) {
  const listing = await ownListing(userId, listingId);
  if (listing.status !== 'SOLD') throw conflict('Only sold listings can be relisted.');
  if (listing.saleType === 'AUCTION') throw conflict('Start a new auction instead: create a new listing.');
  await prisma.listing.update({ where: { id: listingId }, data: { status: 'ACTIVE', soldAt: null, soldToId: null } });
  return getListingDetail(listingId, { id: userId } as AuthUser);
}

export async function removeListing(userId: string, listingId: string, asAdmin = false) {
  const listing = asAdmin
    ? await prisma.listing.findUnique({ where: { id: listingId } })
    : await ownListing(userId, listingId);
  if (!listing || listing.status === 'REMOVED') throw notFound('Listing');
  const openAuction = listing.saleType === 'AUCTION' && listing.status === 'ACTIVE' && listing.bidCount > 0 && !listing.auctionClosedAt;
  if (openAuction && !asAdmin) throw conflict('People have bid on this auction, so it can no longer be deleted.');
  await prisma.listing.update({ where: { id: listingId }, data: { status: 'REMOVED' } });
  await closeOffersFor([listingId]);
  return { ok: true };
}

export const listingDetailInclude = {
  photos: { orderBy: { sortOrder: 'asc' } },
  seller: { include: { user: { select: { id: true, phone: true, avatarUrl: true, createdAt: true, status: true } } } },
  bids: { orderBy: { createdAt: 'desc' }, take: 10, include: { bidder: { select: { id: true, name: true } } } },
  soldTo: { select: { id: true, name: true } },
} satisfies Prisma.ListingInclude;

/** wa.me wants the number in international form without the plus. */
const waDigits = (phone: string) => phone.replace(/\D/g, '');

export async function getListingDetail(listingId: string, viewer?: AuthUser | null, origin?: LatLng | null) {
  await closeAuctionIfEnded(listingId);
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: listingDetailInclude });
  const isOwner = Boolean(viewer && l && l.seller.userId === viewer.id);
  const isAdmin = Boolean(viewer?.roles?.includes('ADMIN'));
  // Removed listings, and listings of suspended accounts, are only visible to their seller and admins.
  if (!l || ((l.status === 'REMOVED' || l.seller.user.status !== 'ACTIVE') && !isOwner && !isAdmin)) throw notFound('Listing');

  const [activeListings, followers, following, thread, pendingOffer] = await Promise.all([
    prisma.listing.count({ where: { sellerId: l.sellerId, status: 'ACTIVE' } }),
    prisma.sellerFollow.count({ where: { sellerId: l.sellerId } }),
    viewer && !isOwner ? prisma.sellerFollow.findUnique({ where: { followerId_sellerId: { followerId: viewer.id, sellerId: l.sellerId } } }) : null,
    viewer && !isOwner ? prisma.listingThread.findUnique({ where: { listingId_buyerId: { listingId, buyerId: viewer.id } }, select: { id: true } }) : null,
    viewer && !isOwner
      ? prisma.barterOffer.findFirst({ where: { listingId, buyerId: viewer.id, status: 'PENDING' }, select: { id: true } })
      : null,
  ]);
  const ownerStats = isOwner
    ? await Promise.all([
        prisma.listingThread.count({ where: { listingId } }),
        prisma.barterOffer.count({ where: { listingId, status: 'PENDING' } }),
      ])
    : null;

  const whatsappPhone =
    viewer && !isOwner && l.seller.showWhatsapp && l.status === 'ACTIVE' ? waDigits(l.seller.whatsappPhone ?? l.seller.user.phone) : null;

  return {
    id: l.id,
    title: l.title,
    description: l.description,
    kind: l.kind,
    category: l.category,
    categoryName: findCategory(l.category)?.name ?? l.category,
    condition: l.condition,
    priceCents: l.priceCents,
    saleType: l.saleType,
    openToBarter: l.openToBarter,
    status: l.status,
    area: l.area,
    city: l.city,
    lat: l.lat,
    lng: l.lng,
    distanceKm: origin ? Math.round(haversineKm(origin, { lat: l.lat, lng: l.lng }) * 10) / 10 : null,
    photos: l.photos.map((p) => ({ id: p.id, url: p.url, thumbUrl: p.thumbUrl ?? p.url })),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    soldAt: l.soldAt,
    auction: auctionState(l),
    bids: l.saleType === 'AUCTION' ? l.bids.map((b) => presentBid(b, viewer?.id)) : [],
    winner: l.saleType === 'AUCTION' && l.status === 'SOLD' && l.soldTo ? { name: publicName(l.soldTo.name), isYou: l.soldTo.id === viewer?.id } : null,
    seller: {
      id: l.seller.id,
      displayName: l.seller.displayName,
      bio: l.seller.bio,
      area: l.seller.area,
      city: l.seller.city,
      avatarUrl: l.seller.user.avatarUrl,
      memberSince: l.seller.user.createdAt,
      activeListings,
      followers,
    },
    viewer: viewer
      ? {
          isOwner,
          following: Boolean(following),
          threadId: thread?.id ?? null,
          pendingOfferId: pendingOffer?.id ?? null,
          whatsappPhone,
          isHighestBidder: l.highestBidderId === viewer.id,
          threads: ownerStats?.[0] ?? null,
          pendingOffers: ownerStats?.[1] ?? null,
        }
      : null,
  };
}

export function presentBid(b: { id: string; amountCents: number; createdAt: Date; bidder: { id: string; name: string | null } }, viewerId?: string) {
  return { id: b.id, amountCents: b.amountCents, createdAt: b.createdAt, bidder: b.bidder.id === viewerId ? 'You' : publicName(b.bidder.name, 'Bidder') };
}

/** Lazily closes an auction whose time is up (the scheduled job does the rest). */
export async function closeAuctionIfEnded(listingId: string): Promise<void> {
  const l = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { saleType: true, status: true, auctionEndsAt: true, auctionClosedAt: true },
  });
  if (l && l.saleType === 'AUCTION' && l.status === 'ACTIVE' && !l.auctionClosedAt && l.auctionEndsAt && l.auctionEndsAt <= new Date()) {
    const { closeAuction } = await import('./auction.service');
    await closeAuction(listingId);
  }
}

export async function listMyListings(userId: string, status?: 'ACTIVE' | 'SOLD') {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) return { seller: null, items: [] };
  const items = await prisma.listing.findMany({
    where: { sellerId: seller.id, status: status ?? { in: ['ACTIVE', 'SOLD'] } },
    include: {
      ...listingSummaryInclude,
      _count: { select: { threads: true, offersReceived: { where: { status: 'PENDING' } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return {
    seller: { id: seller.id, displayName: seller.displayName },
    items: items.map((l) => ({ ...presentListingSummary(l), threads: l._count.threads, pendingOffers: l._count.offersReceived })),
  };
}

// ───────────────────────────── Search ─────────────────────────────

export interface SearchOptions {
  origin?: LatLng | null;
  radiusKm?: number;
  page: number;
  pageSize: number;
  sellerId?: string;
}

function textMatches(searchText: string, keywords: string[]): number {
  return keywords.reduce((n, k) => n + (searchText.includes(keywordPattern(k)) ? 1 : 0), 0);
}

/** Every check a listing must pass for a set of filters, used for search results and alerts. */
function passesFilters(l: Pick<Listing, 'priceCents' | 'saleType' | 'currentBidCents'>, f: SearchFilters): boolean {
  const price = effectivePriceCents(l);
  if (f.minPriceCents !== null && price < f.minPriceCents) return false;
  if (f.maxPriceCents !== null && price > f.maxPriceCents) return false;
  return true;
}

function baseWhere(f: SearchFilters, origin: LatLng | null, radiusKm: number | null, sellerId?: string): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [
    { status: 'ACTIVE' },
    { seller: { user: { status: 'ACTIVE' } } },
    // Auctions that have ended no longer show in searches.
    { OR: [{ saleType: 'FIXED' }, { saleType: 'AUCTION', auctionEndsAt: { gt: new Date() }, auctionClosedAt: null }] },
  ];
  if (f.category) and.push({ category: f.category });
  else if (f.kind) and.push({ kind: f.kind });
  if (f.condition === 'NEW') and.push({ condition: 'NEW' });
  if (f.condition === 'USED') and.push({ condition: { in: ['LIKE_NEW', 'GOOD', 'FAIR'] } });
  if (f.saleType) and.push({ saleType: f.saleType });
  if (f.barter) and.push({ openToBarter: true });
  if (f.area) and.push({ OR: [{ area: { contains: f.area, mode: 'insensitive' } }, { city: { contains: f.area, mode: 'insensitive' } }] });
  if (sellerId) and.push({ sellerId });
  if (origin && radiusKm) {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180)));
    and.push({ lat: { gte: origin.lat - dLat, lte: origin.lat + dLat }, lng: { gte: origin.lng - dLng, lte: origin.lng + dLng } });
  }
  // Without a category, at least one keyword must appear.
  if (!f.category && f.keywords.length) and.push({ OR: f.keywords.map((k) => ({ searchText: { contains: keywordPattern(k) } })) });
  return { AND: and };
}

async function runSearch(f: SearchFilters, opts: SearchOptions, radiusKm: number | null) {
  const origin = opts.origin ?? null;
  const rows = await prisma.listing.findMany({
    where: baseWhere(f, origin, radiusKm, opts.sellerId),
    include: listingSummaryInclude,
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  const scored = rows
    .filter((l) => passesFilters(l, f))
    .map((l) => ({
      l,
      score: textMatches(l.searchText, f.keywords) + (f.category && l.category === f.category ? 1 : 0),
      price: effectivePriceCents(l),
      distance: origin ? haversineKm(origin, { lat: l.lat, lng: l.lng }) : null,
    }))
    .filter((x) => !(origin && radiusKm && x.distance !== null && x.distance > radiusKm));

  const byDistance = (a: (typeof scored)[number], b: (typeof scored)[number]) => (a.distance ?? 1e9) - (b.distance ?? 1e9);
  const byNewest = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.l.createdAt.getTime() - a.l.createdAt.getTime();
  const sorters: Record<SearchFilters['sort'], (a: (typeof scored)[number], b: (typeof scored)[number]) => number> = {
    relevance: (a, b) => b.score - a.score || byDistance(a, b) || byNewest(a, b),
    price_asc: (a, b) => a.price - b.price || byDistance(a, b),
    price_desc: (a, b) => b.price - a.price || byDistance(a, b),
    newest: byNewest,
    nearest: (a, b) => byDistance(a, b) || byNewest(a, b),
    ending_soon: (a, b) => (a.l.auctionEndsAt?.getTime() ?? 9e15) - (b.l.auctionEndsAt?.getTime() ?? 9e15),
  };
  const sort = !origin && f.sort === 'nearest' ? 'newest' : f.sort;
  scored.sort(sorters[sort]);
  const start = (opts.page - 1) * opts.pageSize;
  return {
    total: scored.length,
    items: scored.slice(start, start + opts.pageSize).map((x) => presentListingSummary(x.l, origin)),
  };
}

/**
 * Finds listings for a set of filters. "Near me" searches look within the radius (15 km by
 * default) and widen to 50 km when nothing is that close.
 */
export async function searchListings(f: SearchFilters, opts: SearchOptions) {
  const origin = opts.origin ?? null;
  const near = Boolean(origin && (f.nearMe || opts.radiusKm));
  const radius = near ? (opts.radiusKm ?? 15) : null;
  let result = await runSearch(f, opts, radius);
  let widened = false;
  if (near && f.nearMe && result.total === 0 && (radius ?? 0) < 50) {
    result = await runSearch(f, opts, 50);
    widened = true;
  }
  return {
    ...result,
    page: opts.page,
    pageSize: opts.pageSize,
    totalPages: Math.max(1, Math.ceil(result.total / opts.pageSize)),
    radiusKm: near ? (widened ? 50 : radius) : null,
    widened,
    needsLocation: f.nearMe && !origin,
  };
}

/** Filters chosen on screen (category chips, price boxes, …); they override what the phrase said. */
export interface SearchOverrides {
  category?: string;
  kind?: ListingKind;
  minPriceCents?: number;
  maxPriceCents?: number;
  condition?: 'NEW' | 'USED';
  saleType?: SaleType;
  barter?: boolean;
  nearMe?: boolean;
  area?: string;
  sort?: SearchFilters['sort'];
}

/**
 * DoorStep AI Search: understands the phrase (English, Shona or both), applies the filters chosen
 * on screen on top, then searches. Without a phrase it simply browses with the chosen filters.
 */
export async function searchMarket(q: string | undefined, overrides: SearchOverrides, opts: SearchOptions) {
  const phrase = q?.trim() ? q.trim() : null;
  const interpretation = phrase ? await interpretQuery(phrase) : null;
  const f = buildFilters(interpretation, overrides);
  const results = await searchListings(f, opts);
  return { interpretation, summary: describeFilters(f), filters: f, ...results };
}

/** The phrase's filters with the on-screen choices applied on top. */
export function buildFilters(interpretation: SearchFilters | null, overrides: SearchOverrides): SearchFilters {
  const f: SearchFilters = interpretation
    ? {
        keywords: interpretation.keywords,
        category: interpretation.category,
        kind: interpretation.kind,
        minPriceCents: interpretation.minPriceCents,
        maxPriceCents: interpretation.maxPriceCents,
        condition: interpretation.condition,
        saleType: interpretation.saleType,
        barter: interpretation.barter,
        nearMe: interpretation.nearMe,
        area: interpretation.area,
        sort: interpretation.sort,
      }
    : { ...EMPTY_FILTERS, keywords: [] };

  if (overrides.category) {
    f.category = overrides.category;
    f.kind = findCategory(overrides.category)?.kind ?? null;
  } else if (overrides.kind) {
    f.kind = overrides.kind;
    if (f.category && findCategory(f.category)?.kind !== overrides.kind) f.category = null;
  }
  if (overrides.minPriceCents !== undefined) f.minPriceCents = overrides.minPriceCents;
  if (overrides.maxPriceCents !== undefined) f.maxPriceCents = overrides.maxPriceCents;
  if (f.minPriceCents !== null && f.maxPriceCents !== null && f.minPriceCents > f.maxPriceCents) {
    [f.minPriceCents, f.maxPriceCents] = [f.maxPriceCents, f.minPriceCents];
  }
  if (overrides.condition) f.condition = overrides.condition;
  if (overrides.saleType) f.saleType = overrides.saleType;
  if (overrides.barter) f.barter = true;
  if (overrides.nearMe) f.nearMe = true;
  if (overrides.area) f.area = overrides.area;
  if (overrides.sort) f.sort = overrides.sort;
  // Auctions only take bids, so "swaps" and "auctions" together would never match.
  if (f.barter && f.saleType === 'AUCTION') f.barter = false;
  return f;
}

// ───────────────────────────── Storefronts & follows ─────────────────────────────

export async function getStorefront(sellerId: string, viewer: AuthUser | undefined, page: number, pageSize: number) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    include: { user: { select: { avatarUrl: true, createdAt: true, status: true } } },
  });
  if (!seller || seller.user.status !== 'ACTIVE') throw notFound('Seller');
  const [followers, sold, following, listings] = await Promise.all([
    prisma.sellerFollow.count({ where: { sellerId } }),
    prisma.listing.count({ where: { sellerId, status: 'SOLD' } }),
    viewer ? prisma.sellerFollow.findUnique({ where: { followerId_sellerId: { followerId: viewer.id, sellerId } } }) : null,
    searchListings({ ...EMPTY_FILTERS, sort: 'newest' }, { page, pageSize, sellerId }),
  ]);
  return {
    seller: {
      id: seller.id,
      displayName: seller.displayName,
      bio: seller.bio,
      area: seller.area,
      city: seller.city,
      avatarUrl: seller.user.avatarUrl,
      memberSince: seller.user.createdAt,
      followers,
      sold,
      isYou: viewer?.id === seller.userId,
      following: Boolean(following),
    },
    listings,
  };
}

export async function follow(userId: string, sellerId: string) {
  const seller = await prisma.sellerProfile.findUnique({ where: { id: sellerId } });
  if (!seller) throw notFound('Seller');
  if (seller.userId === userId) throw badRequest("You can't follow your own shop.");
  const count = await prisma.sellerFollow.count({ where: { followerId: userId } });
  assertWithinLimit(count, 500, 'You follow 500 sellers already. Unfollow some first.');
  await prisma.sellerFollow.upsert({
    where: { followerId_sellerId: { followerId: userId, sellerId } },
    create: { followerId: userId, sellerId },
    update: {},
  });
  return { following: true, followers: await prisma.sellerFollow.count({ where: { sellerId } }) };
}

export async function unfollow(userId: string, sellerId: string) {
  await prisma.sellerFollow.deleteMany({ where: { followerId: userId, sellerId } });
  return { following: false, followers: await prisma.sellerFollow.count({ where: { sellerId } }) };
}

export async function listFollowing(userId: string) {
  const rows = await prisma.sellerFollow.findMany({
    where: { followerId: userId },
    include: { seller: { include: { user: { select: { avatarUrl: true } }, _count: { select: { listings: { where: { status: 'ACTIVE' } } } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.seller.id,
    displayName: r.seller.displayName,
    area: r.seller.area,
    city: r.seller.city,
    avatarUrl: r.seller.user.avatarUrl,
    activeListings: r.seller._count.listings,
    followedAt: r.createdAt,
  }));
}

// ───────────────────────────── Saved searches & alerts ─────────────────────────────

export interface SavedSearchInput {
  query?: string;
  filters?: SearchOverrides;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export async function createSavedSearch(userId: string, input: SavedSearchInput) {
  const count = await prisma.savedSearch.count({ where: { userId } });
  assertWithinLimit(count, MAX_SAVED_SEARCHES, `You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one first.`);
  const phrase = input.query?.trim() || null;
  const filters = buildFilters(phrase ? await interpretQuery(phrase) : null, input.filters ?? {});
  if (!phrase && !filters.category && !filters.kind && !filters.area && filters.maxPriceCents === null && filters.minPriceCents === null) {
    throw badRequest('Type what you are looking for, or choose a category, before saving the search.');
  }
  const hasLocation = input.lat !== undefined && input.lng !== undefined;
  const saved = await prisma.savedSearch.create({
    data: {
      userId,
      query: phrase ?? describeFilters(filters),
      filters: filters as unknown as Prisma.InputJsonValue,
      lat: hasLocation ? input.lat : null,
      lng: hasLocation ? input.lng : null,
      radiusKm: input.radiusKm ?? 15,
    },
  });
  return presentSavedSearch(saved);
}

function presentSavedSearch(s: { id: string; query: string; filters: Prisma.JsonValue; lat: number | null; lng: number | null; radiusKm: number; createdAt: Date; lastNotifiedAt: Date | null }) {
  const filters = s.filters as unknown as SearchFilters;
  return {
    id: s.id,
    query: s.query,
    summary: describeFilters(filters),
    hasLocation: s.lat !== null && s.lng !== null,
    radiusKm: s.radiusKm,
    createdAt: s.createdAt,
    lastNotifiedAt: s.lastNotifiedAt,
  };
}

export async function listSavedSearches(userId: string) {
  const rows = await prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return rows.map(presentSavedSearch);
}

export async function deleteSavedSearch(userId: string, id: string) {
  const res = await prisma.savedSearch.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw notFound('Saved search');
  return { ok: true };
}

/** Whether a new listing matches a saved search (filters, keywords and distance). */
export function listingMatchesSaved(
  l: Pick<Listing, 'category' | 'kind' | 'condition' | 'saleType' | 'openToBarter' | 'priceCents' | 'currentBidCents' | 'area' | 'city' | 'lat' | 'lng' | 'searchText'>,
  f: SearchFilters,
  where: { lat: number | null; lng: number | null; radiusKm: number },
): boolean {
  if (f.category && l.category !== f.category) return false;
  if (!f.category && f.kind && l.kind !== f.kind) return false;
  if (f.condition === 'NEW' && l.condition !== 'NEW') return false;
  if (f.condition === 'USED' && (l.condition === null || l.condition === 'NEW')) return false;
  if (f.saleType && l.saleType !== f.saleType) return false;
  if (f.barter && !l.openToBarter) return false;
  if (!passesFilters(l, f)) return false;
  if (f.area && !`${l.area} ${l.city}`.toLowerCase().includes(f.area.toLowerCase())) return false;
  const hits = textMatches(l.searchText, f.keywords ?? []);
  if (!f.category && (f.keywords ?? []).length && hits === 0) return false;
  if (where.lat !== null && where.lng !== null && haversineKm({ lat: where.lat, lng: where.lng }, { lat: l.lat, lng: l.lng }) > where.radiusKm) {
    return false;
  }
  return true;
}

const MAX_ALERTS_PER_LISTING = 500;

/** Tells followers of the seller, and people with matching saved searches nearby, about a new listing. */
export async function notifyWatchers(listingId: string): Promise<number> {
  const l = await prisma.listing.findUnique({ where: { id: listingId }, include: { seller: true } });
  if (!l || l.status !== 'ACTIVE') return 0;
  const price = l.saleType === 'AUCTION' ? `auction from ${formatMoney(l.priceCents, 'USD')}` : formatMoney(l.priceCents, 'USD');
  const recipients = new Map<string, { title: string; body: string }>();

  const followers = await prisma.sellerFollow.findMany({ where: { sellerId: l.sellerId }, select: { followerId: true }, take: MAX_ALERTS_PER_LISTING });
  for (const f of followers) {
    if (f.followerId !== l.seller.userId) {
      recipients.set(f.followerId, { title: `New from ${l.seller.displayName}`, body: `${l.title} · ${price} · ${l.area}` });
    }
  }

  const matchedSearchIds: string[] = [];
  let cursor: string | undefined;
  // Saved searches are read in pages so a popular marketplace doesn't load them all at once.
  for (;;) {
    const page = await prisma.savedSearch.findMany({
      where: { userId: { not: l.seller.userId } },
      orderBy: { id: 'asc' },
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const s of page) {
      const filters = s.filters as unknown as SearchFilters;
      if (!listingMatchesSaved(l, filters, s)) continue;
      matchedSearchIds.push(s.id);
      if (!recipients.has(s.userId)) {
        recipients.set(s.userId, { title: `New match for “${s.query.slice(0, 40)}”`, body: `${l.title} · ${price} · ${l.area}` });
      }
    }
    if (page.length < 1000 || recipients.size >= MAX_ALERTS_PER_LISTING) break;
    cursor = page[page.length - 1].id;
  }
  if (matchedSearchIds.length) {
    await prisma.savedSearch.updateMany({ where: { id: { in: matchedSearchIds } }, data: { lastNotifiedAt: new Date() } });
  }

  let sent = 0;
  for (const [userId, message] of recipients) {
    if (sent >= MAX_ALERTS_PER_LISTING) break;
    notifyAsync({ userId, type: 'MARKET_ALERT', title: message.title, body: message.body, data: { listingId } });
    sent++;
  }
  return sent;
}

export function marketCategories() {
  return MARKET_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, shona: c.shona, kind: c.kind }));
}
