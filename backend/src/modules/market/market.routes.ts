import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { defineRoute, idParams, latLng, paged, pagination, queryBool } from '../../lib/route';
import { imageUrl, moneyCents, optionalTrimmed, phoneSchema } from '../../lib/validation';
import { prisma } from '../../lib/prisma';
import { bidLimiter, chatLimiter, offerLimiter, searchLimiter } from '../../middleware/rateLimit';
import { notifyAsync } from '../notifications/notification.service';
import { CATEGORY_SLUGS, MAX_LISTING_PHOTOS } from './market.constants';
import { SEARCH_SORTS, type SearchSort } from './query-parser';
import {
  createListing,
  createSavedSearch,
  deleteSavedSearch,
  follow,
  getListingDetail,
  getMySeller,
  getStorefront,
  listFollowing,
  listMyListings,
  listSavedSearches,
  listingSummaryInclude,
  marketCategories,
  markSold,
  presentListingSummary,
  relist,
  removeListing,
  searchMarket,
  unfollow,
  updateListing,
  upsertSeller,
} from './market.service';
import { getAuctionState, placeBid } from './auction.service';
import { getThread, listThreads, messageSeller, sendThreadMessage, unreadTotal } from './market-chat.service';
import {
  MAX_OFFER_ITEMS,
  acceptOffer,
  counterOffer,
  createOffer,
  declineOffer,
  getOffer,
  listOffers,
  offerBuyerItems,
  swappableItems,
  withdrawOffer,
} from './barter.service';

export const marketRouter = Router();
const basePath = '/api/v1/market';
const tags = ['Marketplace'];

// ───────────────────────────── Schemas ─────────────────────────────

const sortEnum = z.enum(SEARCH_SORTS as [SearchSort, ...SearchSort[]]);
const placeName = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z .'-]{1,39}$/, 'Enter a town or suburb name');
const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const queryNumber = (min: number, max: number) => z.coerce.number().min(min).max(max);
const queryCents = z.coerce.number().int().min(0).max(100_000_000);

/** A location in the query string: both coordinates or neither. */
const queryLocation = {
  lat: queryNumber(-90, 90).optional(),
  lng: queryNumber(-180, 180).optional(),
};
const bothOrNeither = (v: { lat?: number; lng?: number }) => (v.lat === undefined) === (v.lng === undefined);
const locationMessage = { message: 'Send both lat and lng, or neither', path: ['lat'] };
const originOf = (v: { lat?: number; lng?: number }) => (v.lat !== undefined && v.lng !== undefined ? { lat: v.lat, lng: v.lng } : null);

const filterOverrides = {
  category: z.enum(CATEGORY_SLUGS).optional(),
  kind: z.enum(['ITEM', 'SERVICE']).optional(),
  minPriceCents: queryCents.optional(),
  maxPriceCents: queryCents.optional(),
  condition: z.enum(['NEW', 'USED']).optional(),
  saleType: z.enum(['FIXED', 'AUCTION']).optional(),
  barter: queryBool.optional(),
  nearMe: queryBool.optional(),
  area: placeName.optional(),
  sort: sortEnum.optional(),
};

const searchQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    ...filterOverrides,
    ...queryLocation,
    radiusKm: queryNumber(1, 100).optional(),
    page: z.coerce.number().int().min(1).max(50).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine(bothOrNeither, locationMessage);

const sellerBody = z.object({
  displayName: z.string().trim().min(2, 'Enter your shop or display name').max(60),
  bio: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
  area: z.string().trim().min(2, 'Enter your area or suburb').max(80),
  city: z.string().trim().min(2, 'Enter your town or city').max(80),
  ...latLng,
  whatsappPhone: phoneSchema.nullish(),
  showWhatsapp: z.boolean().optional(),
});

const listingFields = {
  kind: z.enum(['ITEM', 'SERVICE']),
  title: z.string().trim().min(3, 'Give your listing a title (at least 3 letters)').max(80),
  description: z.string().trim().min(10, 'Describe it in a sentence or two (at least 10 letters)').max(2000),
  category: z.enum(CATEGORY_SLUGS),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']).nullable(),
  priceCents: moneyCents,
  saleType: z.enum(['FIXED', 'AUCTION']),
  auctionEndsAt: isoDate.nullable(),
  openToBarter: z.boolean(),
  photos: z.array(imageUrl).max(MAX_LISTING_PHOTOS),
  area: optionalTrimmed(80),
  city: optionalTrimmed(80),
  lat: latLng.lat,
  lng: latLng.lng,
};

const createListingBody = z
  .object({
    ...listingFields,
    condition: listingFields.condition.optional(),
    saleType: listingFields.saleType.default('FIXED'),
    auctionEndsAt: listingFields.auctionEndsAt.optional(),
    openToBarter: listingFields.openToBarter.default(false),
    photos: listingFields.photos.default([]),
    lat: listingFields.lat.optional(),
    lng: listingFields.lng.optional(),
  })
  .refine(bothOrNeither, locationMessage);

const updateListingBody = z
  .object({
    kind: listingFields.kind.optional(),
    title: listingFields.title.optional(),
    description: listingFields.description.optional(),
    category: listingFields.category.optional(),
    condition: listingFields.condition.optional(),
    priceCents: listingFields.priceCents.optional(),
    saleType: listingFields.saleType.optional(),
    auctionEndsAt: listingFields.auctionEndsAt.optional(),
    openToBarter: listingFields.openToBarter.optional(),
    photos: listingFields.photos.optional(),
    area: listingFields.area,
    city: listingFields.city,
    lat: listingFields.lat.optional(),
    lng: listingFields.lng.optional(),
  })
  .refine(bothOrNeither, locationMessage);

const messageBody = z.object({ body: z.string().trim().min(1, 'Type a message').max(1000) });

const offerBody = z.object({
  itemIds: z.array(z.string().min(1).max(64)).min(1, 'Choose at least one of your items to offer').max(MAX_OFFER_ITEMS),
  cashCents: moneyCents.default(0),
  message: optionalTrimmed(500),
});

const savedSearchBody = z
  .object({
    query: optionalTrimmed(200),
    filters: z
      .object({
        category: filterOverrides.category,
        kind: filterOverrides.kind,
        minPriceCents: moneyCents.optional(),
        maxPriceCents: moneyCents.optional(),
        condition: filterOverrides.condition,
        saleType: filterOverrides.saleType,
        barter: z.boolean().optional(),
        nearMe: z.boolean().optional(),
        area: filterOverrides.area,
      })
      .optional(),
    lat: latLng.lat.optional(),
    lng: latLng.lng.optional(),
    radiusKm: z.number().int().min(1).max(100).optional(),
  })
  .refine(bothOrNeither, locationMessage);

// ───────────────────────────── Browse & search ─────────────────────────────

defineRoute(marketRouter, {
  method: 'get',
  path: '/categories',
  basePath,
  tags,
  summary: 'Marketplace categories (items and services) with Shona names',
  auth: 'public',
  handler: () => marketCategories(),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/search',
  basePath,
  tags,
  summary: 'DoorStep AI Search: listings for an everyday phrase in English or Shona, plus filters',
  description:
    'Understands phrases like "cheapest plumber near me" or "foni yakachipa pasi pe$100 kuMbare". Filters in the query override what the phrase said. Send lat/lng for distance and "near me". Without q it browses with the filters.',
  auth: 'optional',
  query: searchQuery,
  middleware: [searchLimiter],
  handler: ({ query }) => {
    const { q, lat, lng, radiusKm, page, pageSize, ...overrides } = query;
    return searchMarket(q, overrides, { origin: originOf({ lat, lng }), radiusKm, page, pageSize });
  },
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/listings/:id',
  basePath,
  tags,
  summary: 'A listing with photos, seller, auction state and what the viewer can do',
  description: 'Signed-in viewers also get the seller’s WhatsApp number (when the seller shows it), their conversation and their pending swap offer.',
  auth: 'optional',
  params: idParams,
  query: z.object(queryLocation).refine(bothOrNeither, locationMessage),
  handler: ({ params, query, user }) => getListingDetail(params.id, user, originOf(query)),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/listings/:id/auction',
  basePath,
  tags,
  summary: 'Live auction state (current bid, end time, recent bids) for polling',
  auth: 'optional',
  params: idParams,
  handler: ({ params, user }) => getAuctionState(params.id, user),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/sellers/:id',
  basePath,
  tags,
  summary: 'A seller’s storefront and active listings',
  auth: 'optional',
  params: idParams,
  query: pagination.extend({ pageSize: z.coerce.number().int().min(1).max(48).default(24) }),
  handler: ({ params, query, user }) => getStorefront(params.id, user, query.page, query.pageSize),
});

// ───────────────────────────── Seller dashboard ─────────────────────────────

defineRoute(marketRouter, {
  method: 'get',
  path: '/me/seller',
  basePath,
  tags,
  summary: 'My seller profile (null until set up)',
  auth: 'required',
  handler: async ({ user }) => ({ seller: await getMySeller(user.id) }),
});

defineRoute(marketRouter, {
  method: 'put',
  path: '/me/seller',
  basePath,
  tags,
  summary: 'Create or update my seller profile',
  auth: 'required',
  body: sellerBody,
  handler: async ({ body, user }) => ({ seller: await upsertSeller(user.id, body) }),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/me/listings',
  basePath,
  tags,
  summary: 'My listings (active and sold) with conversation and offer counts',
  auth: 'required',
  query: z.object({ status: z.enum(['ACTIVE', 'SOLD']).optional() }),
  handler: ({ query, user }) => listMyListings(user.id, query.status),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/listings',
  basePath,
  tags,
  summary: 'Create a listing (item or service; fixed price or auction)',
  auth: 'required',
  status: 201,
  body: createListingBody,
  handler: ({ body, user }) => createListing(user.id, body),
});

defineRoute(marketRouter, {
  method: 'patch',
  path: '/listings/:id',
  basePath,
  tags,
  summary: 'Edit my listing',
  auth: 'required',
  params: idParams,
  body: updateListingBody,
  handler: ({ params, body, user }) => updateListing(user.id, params.id, body),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/listings/:id/sold',
  basePath,
  tags,
  summary: 'Mark my listing as sold',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => markSold(user.id, params.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/listings/:id/relist',
  basePath,
  tags,
  summary: 'Put a sold listing back on sale',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => relist(user.id, params.id),
});

defineRoute(marketRouter, {
  method: 'delete',
  path: '/listings/:id',
  basePath,
  tags,
  summary: 'Delete my listing',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => removeListing(user.id, params.id),
});

// ───────────────────────────── Auctions ─────────────────────────────

defineRoute(marketRouter, {
  method: 'post',
  path: '/listings/:id/bids',
  basePath,
  tags,
  summary: 'Bid on an auction',
  description: 'Rate limited. A bid in the last two minutes extends the auction to two minutes from the bid.',
  auth: 'required',
  params: idParams,
  status: 201,
  middleware: [bidLimiter],
  body: z.object({ amountCents: z.number().int().min(1).max(100_000_000) }),
  handler: ({ params, body, user }) => placeBid(user, params.id, body.amountCents),
});

// ───────────────────────────── Chat ─────────────────────────────

defineRoute(marketRouter, {
  method: 'post',
  path: '/listings/:id/messages',
  basePath,
  tags,
  summary: 'Message the seller about a listing (opens the conversation)',
  auth: 'required',
  params: idParams,
  status: 201,
  middleware: [chatLimiter],
  body: messageBody,
  handler: ({ params, body, user }) => messageSeller(user, params.id, body.body),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/threads',
  basePath,
  tags,
  summary: 'My marketplace conversations, latest first, with unread counts',
  auth: 'required',
  handler: ({ user }) => listThreads(user),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/threads/unread',
  basePath,
  tags,
  summary: 'Total unread marketplace messages',
  auth: 'required',
  handler: ({ user }) => unreadTotal(user.id),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/threads/:id',
  basePath,
  tags,
  summary: 'A conversation’s messages (marks them read); `after` returns only newer ones',
  auth: 'required',
  params: idParams,
  query: z.object({ after: isoDate.optional() }),
  handler: ({ params, query, user }) => getThread(user, params.id, query.after),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/threads/:id/messages',
  basePath,
  tags,
  summary: 'Reply in a conversation',
  auth: 'required',
  params: idParams,
  status: 201,
  middleware: [chatLimiter],
  body: messageBody,
  handler: ({ params, body, user }) => sendThreadMessage(user, params.id, body.body),
});

// ───────────────────────────── Swaps ─────────────────────────────

defineRoute(marketRouter, {
  method: 'get',
  path: '/me/swappable',
  basePath,
  tags,
  summary: 'My items that can go in a swap offer (active, fixed price)',
  auth: 'required',
  handler: ({ user }) => swappableItems(user.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/listings/:id/offers',
  basePath,
  tags,
  summary: 'Offer one or more of my items (plus optional cash) in exchange for a listing',
  auth: 'required',
  params: idParams,
  status: 201,
  middleware: [offerLimiter],
  body: offerBody,
  handler: ({ params, body, user }) => createOffer(user, params.id, body),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/offers',
  basePath,
  tags,
  summary: 'Swap offers I made or received, newest first',
  auth: 'required',
  handler: ({ user }) => listOffers(user),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/offers/:id',
  basePath,
  tags,
  summary: 'A swap offer with the earlier offers it answered',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => getOffer(user, params.id),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/offers/:id/buyer-items',
  basePath,
  tags,
  summary: 'The buyer’s items that a counter offer can ask for',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => offerBuyerItems(user, params.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/offers/:id/accept',
  basePath,
  tags,
  summary: 'Accept a swap offer',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => acceptOffer(user, params.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/offers/:id/decline',
  basePath,
  tags,
  summary: 'Decline a swap offer',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => declineOffer(user, params.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/offers/:id/withdraw',
  basePath,
  tags,
  summary: 'Withdraw my swap offer',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => withdrawOffer(user, params.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/offers/:id/counter',
  basePath,
  tags,
  summary: 'Answer a swap offer with a counter offer',
  auth: 'required',
  params: idParams,
  status: 201,
  middleware: [offerLimiter],
  body: offerBody,
  handler: ({ params, body, user }) => counterOffer(user, params.id, body),
});

// ───────────────────────────── Follows, saved searches & alerts ─────────────────────────────

defineRoute(marketRouter, {
  method: 'post',
  path: '/sellers/:id/follow',
  basePath,
  tags,
  summary: 'Follow a seller (get alerts for their new listings)',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => follow(user.id, params.id),
});

defineRoute(marketRouter, {
  method: 'delete',
  path: '/sellers/:id/follow',
  basePath,
  tags,
  summary: 'Unfollow a seller',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => unfollow(user.id, params.id),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/me/following',
  basePath,
  tags,
  summary: 'Sellers I follow',
  auth: 'required',
  handler: ({ user }) => listFollowing(user.id),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/me/saved-searches',
  basePath,
  tags,
  summary: 'My saved searches',
  auth: 'required',
  handler: ({ user }) => listSavedSearches(user.id),
});

defineRoute(marketRouter, {
  method: 'post',
  path: '/me/saved-searches',
  basePath,
  tags,
  summary: 'Save a search; I get an alert when a matching listing is posted nearby',
  auth: 'required',
  status: 201,
  middleware: [searchLimiter],
  body: savedSearchBody,
  handler: ({ body, user }) => createSavedSearch(user.id, body),
});

defineRoute(marketRouter, {
  method: 'delete',
  path: '/me/saved-searches/:id',
  basePath,
  tags,
  summary: 'Delete a saved search',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => deleteSavedSearch(user.id, params.id),
});

defineRoute(marketRouter, {
  method: 'get',
  path: '/me/alerts',
  basePath,
  tags,
  summary: 'My recent marketplace alerts with the listings they point to',
  auth: 'required',
  handler: async ({ user }) => {
    const notes = await prisma.notification.findMany({
      where: { userId: user.id, type: 'MARKET_ALERT' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const listingIdOf = (data: Prisma.JsonValue) =>
      data && typeof data === 'object' && !Array.isArray(data) && typeof data.listingId === 'string' ? data.listingId : null;
    const ids = [...new Set(notes.map((n) => listingIdOf(n.data)).filter((id): id is string => Boolean(id)))];
    const listings = await prisma.listing.findMany({
      where: { id: { in: ids }, status: { not: 'REMOVED' } },
      include: listingSummaryInclude,
    });
    const byId = new Map(listings.map((l) => [l.id, presentListingSummary(l)]));
    return notes.map((n) => {
      const id = listingIdOf(n.data);
      return { id: n.id, title: n.title, body: n.body, readAt: n.readAt, createdAt: n.createdAt, listing: id ? (byId.get(id) ?? null) : null };
    });
  },
});

// ───────────────────────────── Admin ─────────────────────────────

defineRoute(marketRouter, {
  method: 'get',
  path: '/admin/listings',
  basePath,
  tags,
  summary: 'All marketplace listings (newest first), for moderation',
  auth: 'required',
  roles: ['ADMIN'],
  query: pagination.extend({
    status: z.enum(['ACTIVE', 'SOLD', 'REMOVED']).optional(),
    q: z.string().trim().max(100).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.ListingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: listingSummaryInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.listing.count({ where }),
    ]);
    return paged(
      rows.map((l) => presentListingSummary(l)),
      total,
      query.page,
      query.pageSize,
    );
  },
});

defineRoute(marketRouter, {
  method: 'delete',
  path: '/admin/listings/:id',
  basePath,
  tags,
  summary: 'Remove a listing that breaks the rules',
  auth: 'required',
  roles: ['ADMIN'],
  params: idParams,
  body: z.object({ reason: z.string().trim().min(3, 'Say why the listing is removed').max(300) }),
  handler: async ({ params, body, user }) => {
    const listing = await prisma.listing.findUnique({ where: { id: params.id }, include: { seller: { select: { userId: true } } } });
    const result = await removeListing(user.id, params.id, true);
    if (listing) {
      notifyAsync({
        userId: listing.seller.userId,
        type: 'MARKET_REMOVED',
        title: 'Listing removed',
        body: `“${listing.title}” was removed by DoorStep: ${body.reason}`,
        data: { listingId: listing.id },
      });
    }
    return result;
  },
});
