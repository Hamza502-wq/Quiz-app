'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@doorstep/web-shared';

// ───────────────────────────── Types (match the API's /market responses) ─────────────────────────────

export type ListingKind = 'ITEM' | 'SERVICE';
export type ListingCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'REMOVED';
export type SaleType = 'FIXED' | 'AUCTION';
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COUNTERED' | 'WITHDRAWN';
export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'nearest' | 'ending_soon';

export interface MarketCategory {
  slug: string;
  name: string;
  shona: string;
  kind: ListingKind;
}

export interface AuctionState {
  startingPriceCents: number;
  currentBidCents: number | null;
  bidCount: number;
  endsAt: string;
  ended: boolean;
  minNextBidCents: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  kind: ListingKind;
  category: string;
  categoryName: string;
  condition: ListingCondition | null;
  priceCents: number;
  saleType: SaleType;
  openToBarter: boolean;
  status: ListingStatus;
  area: string;
  city: string;
  photoUrl: string | null;
  thumbUrl: string | null;
  distanceKm: number | null;
  createdAt: string;
  auction: AuctionState | null;
  seller: { id: string; displayName: string; avatarUrl: string | null };
}

export interface MyListing extends ListingSummary {
  threads: number;
  pendingOffers: number;
}

export interface PublicBid {
  id: string;
  amountCents: number;
  createdAt: string;
  bidder: string;
}

export interface ListingDetail {
  id: string;
  title: string;
  description: string;
  kind: ListingKind;
  category: string;
  categoryName: string;
  condition: ListingCondition | null;
  priceCents: number;
  saleType: SaleType;
  openToBarter: boolean;
  status: ListingStatus;
  area: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  photos: Array<{ id: string; url: string; thumbUrl: string }>;
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
  auction: AuctionState | null;
  bids: PublicBid[];
  winner: { name: string; isYou: boolean } | null;
  seller: {
    id: string;
    displayName: string;
    bio: string | null;
    area: string;
    city: string;
    avatarUrl: string | null;
    memberSince: string;
    activeListings: number;
    followers: number;
  };
  viewer: {
    isOwner: boolean;
    following: boolean;
    threadId: string | null;
    pendingOfferId: string | null;
    whatsappPhone: string | null;
    isHighestBidder: boolean;
    threads: number | null;
    pendingOffers: number | null;
  } | null;
}

export interface LiveAuction {
  listingId: string;
  status: ListingStatus;
  auction: AuctionState | null;
  bids: PublicBid[];
  isHighestBidder: boolean;
  winner: { name: string; isYou: boolean } | null;
  serverTime: string;
}

export interface SearchFilters {
  keywords: string[];
  category: string | null;
  kind: ListingKind | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  condition: 'NEW' | 'USED' | null;
  saleType: SaleType | null;
  barter: boolean;
  nearMe: boolean;
  area: string | null;
  sort: SearchSort;
}

export interface SearchResult {
  interpretation: (SearchFilters & { summary: string; language: 'en' | 'sn' | 'mixed'; source: 'ai' | 'rules' }) | null;
  summary: string;
  filters: SearchFilters;
  items: ListingSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  radiusKm: number | null;
  widened: boolean;
  needsLocation: boolean;
}

export interface SellerProfile {
  id: string;
  displayName: string;
  bio: string | null;
  area: string;
  city: string;
  lat: number;
  lng: number;
  whatsappPhone: string | null;
  accountPhone: string;
  showWhatsapp: boolean;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Storefront {
  seller: {
    id: string;
    displayName: string;
    bio: string | null;
    area: string;
    city: string;
    avatarUrl: string | null;
    memberSince: string;
    followers: number;
    sold: number;
    isYou: boolean;
    following: boolean;
  };
  listings: { items: ListingSummary[]; total: number; page: number; totalPages: number };
}

export interface MarketMessage {
  id: string;
  threadId: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface MarketThread {
  id: string;
  role: 'buyer' | 'seller';
  listing: { id: string; title: string; status: ListingStatus; saleType: SaleType; priceCents: number; thumbUrl: string | null };
  other: { name: string; avatarUrl: string | null; sellerId: string | null };
  lastMessageAt: string;
  createdAt: string;
}

export interface MarketThreadSummary extends MarketThread {
  lastMessage: MarketMessage | null;
  unread: number;
}

export interface Offer {
  id: string;
  status: OfferStatus;
  role: 'buyer' | 'seller';
  madeBy: 'buyer' | 'seller';
  mine: boolean;
  canRespond: boolean;
  canWithdraw: boolean;
  listing: ListingSummary;
  items: ListingSummary[];
  cashCents: number;
  message: string | null;
  buyerName: string;
  sellerName: string;
  parentId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface OfferDetail extends Offer {
  history: Offer[];
}

export interface SavedSearch {
  id: string;
  query: string;
  summary: string;
  hasLocation: boolean;
  radiusKm: number;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export interface FollowedSeller {
  id: string;
  displayName: string;
  area: string;
  city: string;
  avatarUrl: string | null;
  activeListings: number;
  followedAt: string;
}

export interface MarketAlert {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  listing: ListingSummary | null;
}

// ───────────────────────────── Labels & links ─────────────────────────────

export const CONDITION_LABEL: Record<ListingCondition, string> = {
  NEW: 'Brand new',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
};

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  PENDING: 'Waiting for an answer',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  COUNTERED: 'Countered',
  WITHDRAWN: 'Withdrawn',
};

export const SORT_LABEL: Record<SearchSort, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  nearest: 'Nearest',
  price_asc: 'Cheapest',
  price_desc: 'Most expensive',
  ending_soon: 'Auctions ending soon',
};

/** Page links use query strings so the site can be exported as static files. */
export const listingHref = (id: string) => `/market/listing?id=${encodeURIComponent(id)}`;
export const sellerHref = (id: string) => `/market/seller?id=${encodeURIComponent(id)}`;
export const threadHref = (id: string) => `/market/messages?thread=${encodeURIComponent(id)}`;
export const offerHref = (id: string) => `/market/offers?id=${encodeURIComponent(id)}`;

export const usd = (cents: number) => formatMoney(cents, 'USD');

/** What a listing costs now: "US$45", "Free", or the current bid of an auction. */
export function priceLabel(l: Pick<ListingSummary, 'priceCents' | 'saleType' | 'auction' | 'kind'>): string {
  if (l.saleType === 'AUCTION' && l.auction) return usd(l.auction.currentBidCents ?? l.auction.startingPriceCents);
  if (l.priceCents === 0) return l.kind === 'SERVICE' ? 'Ask for a quote' : 'Free';
  return usd(l.priceCents);
}

/**
 * A "Chat on WhatsApp" link with the listing already described. `phoneDigits` is the seller's
 * number in international form without "+", as the API returns it.
 */
export function whatsappLink(phoneDigits: string, listing: Pick<ListingDetail, 'id' | 'title' | 'priceCents' | 'saleType' | 'auction' | 'kind' | 'area'>): string {
  const url = typeof window === 'undefined' ? listingHref(listing.id) : `${window.location.origin}${listingHref(listing.id)}`;
  const text = `Hi! I saw your listing on DoorStep Zimbabwe: “${listing.title}” (${priceLabel(listing)}, ${listing.area}). Is it still available?\n${url}`;
  return `https://wa.me/${phoneDigits.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Parses "45", "45.50" or "$1,200" into cents; null when it isn't a valid amount. */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '').replace(/^US/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isFinite(cents) && cents <= 100_000_000 ? cents : null;
}

export const centsToDollars = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

// ───────────────────────────── Countdown ─────────────────────────────

/**
 * Milliseconds left until `endsAt`, ticking every second. `skewMs` is the difference between
 * the server's clock and this device's, so a wrong phone clock doesn't show the wrong time.
 */
export function useCountdown(endsAt: string | null | undefined, skewMs = 0): number | null {
  const target = endsAt ? new Date(endsAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (target === null) return null;
  return Math.max(0, target - (now + skewMs));
}

/** "2d 4h", "3h 12m", "4m 09s", "Ended". */
export function countdownLabel(ms: number | null): string {
  if (ms === null) return '';
  if (ms <= 0) return 'Ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

/** Example phrases for the AI search box, in English and Shona. */
export const SEARCH_EXAMPLES = [
  'cheapest plumber near me',
  'foni yakachipa pasi pe$100',
  'used fridge in Bulawayo under $200',
  'mbatya dzevana',
  'auction ending soon',
  'swap my laptop for a phone',
];
