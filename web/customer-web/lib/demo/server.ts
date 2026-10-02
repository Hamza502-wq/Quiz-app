/**
 * In-browser stand-in for the DoorStep API, used when the website is deployed on
 * its own (e.g. a Netlify preview) with NEXT_PUBLIC_DEMO_MODE=true.
 *
 * It answers the same /api/v1 routes the website calls, keeps its data in
 * localStorage, and moves orders through the real statuses on a timer so the
 * tracking screens can be seen working. Nothing leaves the browser: there are
 * no real stores, riders or payments.
 */
import { ORDER_STATUS_LABEL, config, type Currency, type OrderStatus, type PaymentMethod, type Product, type Profile } from '@doorstep/web-shared';
import type { Address, ChatMessage, CustomerOrder, PaymentInfo, Review, VendorSummary } from '../types';
import {
  DEMO_CATEGORIES,
  DEMO_CUSTOMER,
  DEMO_OTP,
  DEMO_RIDERS,
  DEMO_SETTINGS,
  DEMO_VENDORS,
  type DemoVendorSeed,
} from './data';

const STORAGE_KEY = 'ds_demo_db_v1';
const PAYMENT_SETTLE_MS = 5000;
const RIDER_REPLY_MS = 3000;

// ───────────────────────────── Data model ─────────────────────────────

interface DemoUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  preferredCurrency: Currency;
  notificationChannel: 'SMS' | 'WHATSAPP';
  defaultAddressId: string | null;
}

interface DemoAddress extends Omit<Address, 'isDefault'> {
  userId: string;
  deleted: boolean;
}

interface DemoPayment extends PaymentInfo {
  userId: string;
}

interface DemoMessage {
  id: string;
  orderId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

type OrderRecord = Omit<CustomerOrder, 'statusLabel' | 'vendor' | 'rider' | 'payment' | 'proof' | 'canRate' | 'customer'> & {
  userId: string;
  vendorId: string | null;
  riderId: string | null;
  /** When the order reached PLACED (ms); drives the simulated progress. */
  placedAtMs: number | null;
  etaMinutes: number;
};

interface DemoDb {
  version: 1;
  seq: number;
  users: DemoUser[];
  addresses: DemoAddress[];
  orders: OrderRecord[];
  payments: DemoPayment[];
  messages: DemoMessage[];
  stockUsed: Record<string, number>;
  reviews: Record<string, Review[]>;
}

class DemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const badRequest = (m: string) => new DemoError(400, 'BAD_REQUEST', m);
const notFound = (what: string) => new DemoError(404, 'NOT_FOUND', `${what} not found`);
const conflict = (m: string) => new DemoError(409, 'CONFLICT', m);
const unauthorized = () => new DemoError(401, 'UNAUTHORIZED', 'Authentication required');

// ───────────────────────────── Helpers ─────────────────────────────

function nextId(db: DemoDb, prefix: string): string {
  db.seq += 1;
  return `${prefix}-${db.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('263') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^7[1-8]\d{7}$/.test(local) ? `+263${local}` : null;
}

function requirePhone(input: unknown, label = 'phone'): string {
  const phone = normalizePhone(input);
  if (!phone) throw new DemoError(400, 'VALIDATION_ERROR', `${label}: Enter a valid phone number, e.g. 0771 234 567`);
  return phone;
}

function text(input: unknown, field: string, max: number, required = true): string | undefined {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) {
    if (required) throw new DemoError(400, 'VALIDATION_ERROR', `${field}: Required`);
    return undefined;
  }
  if (value.length > max) throw new DemoError(400, 'VALIDATION_ERROR', `${field}: Too long (max ${max} characters)`);
  return value;
}

function latLng(lat: unknown, lng: unknown): { lat: number; lng: number } {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new DemoError(400, 'VALIDATION_ERROR', 'lat: Pick a valid spot on the map');
  }
  return { lat, lng };
}

const toRad = (d: number) => (d * Math.PI) / 180;
function roadDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(km * 1.3 * 100) / 100;
}
const travelMinutes = (km: number) => Math.max(1, Math.ceil((km / DEMO_SETTINGS.riderAvgSpeedKmh) * 60));
const deliveryFee = (km: number) =>
  Math.max(DEMO_SETTINGS.minDeliveryFeeCents, Math.round(DEMO_SETTINGS.deliveryFeeBaseCents + DEMO_SETTINGS.deliveryFeePerKmCents * km));

function randomCode(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const ALL_DAY_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '00:00' }));

function vendorById(idOrSlug: string): DemoVendorSeed | undefined {
  return DEMO_VENDORS.find((v) => v.id === idOrSlug || v.slug === idOrSlug);
}

function productsOf(db: DemoDb, v: DemoVendorSeed): Array<Product & { sectionName: string }> {
  const out: Array<Product & { sectionName: string }> = [];
  v.menu.forEach((section, si) =>
    section.items.forEach(([name, priceCents, description, stock], ii) => {
      const id = `${v.id}-p${si}${ii}`;
      const trackStock = stock !== undefined;
      const stockQty = trackStock ? Math.max(0, stock - (db.stockUsed[id] ?? 0)) : null;
      out.push({
        id,
        vendorId: v.id,
        sectionId: `${v.id}-s${si}`,
        sectionName: section.section,
        name,
        description,
        priceCents,
        imageUrl: null,
        thumbUrl: null,
        isAvailable: !trackStock || (stockQty ?? 0) > 0,
        trackStock,
        stockQty,
        sortOrder: ii,
      });
    }),
  );
  return out;
}

function vendorRating(db: DemoDb, v: DemoVendorSeed) {
  const extra = db.reviews[v.id] ?? [];
  const count = v.ratingCount + extra.length;
  const sum = v.ratingAvg * v.ratingCount + extra.reduce((s, r) => s + r.score, 0);
  return { ratingAvg: Math.round((sum / count) * 10) / 10, ratingCount: count };
}

function presentVendor(db: DemoDb, v: DemoVendorSeed) {
  return {
    id: v.id,
    name: v.name,
    slug: v.slug,
    description: v.description,
    phone: v.phone,
    logoUrl: null,
    coverUrl: null,
    lat: v.lat,
    lng: v.lng,
    addressLine: v.addressLine,
    landmark: v.landmark,
    city: v.city,
    category: { slug: v.category, name: DEMO_CATEGORIES.find((c) => c.slug === v.category)!.name },
    isOpen: true,
    isAcceptingOrders: true,
    avgPrepMinutes: v.avgPrepMinutes,
    minOrderCents: v.minOrderCents,
    ...vendorRating(db, v),
    openingHours: ALL_DAY_HOURS,
  };
}

function delivery(v: DemoVendorSeed, origin: { lat: number; lng: number }) {
  const distanceKm = roadDistanceKm({ lat: v.lat, lng: v.lng }, origin);
  return {
    distanceKm,
    deliveryFeeCents: deliveryFee(distanceKm),
    etaMinutes: v.avgPrepMinutes + travelMinutes(distanceKm),
    deliverable: distanceKm <= DEMO_SETTINGS.maxDeliveryKm,
  };
}

function profile(u: DemoUser): Profile {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    status: 'ACTIVE',
    roles: ['CUSTOMER'],
    preferredCurrency: u.preferredCurrency,
    notificationChannel: u.notificationChannel,
    hasPassword: false,
    vendor: null,
    rider: null,
  };
}

function presentAddress(db: DemoDb, a: DemoAddress): Address {
  const user = db.users.find((u) => u.id === a.userId);
  return {
    id: a.id,
    label: a.label,
    lat: a.lat,
    lng: a.lng,
    street: a.street,
    suburb: a.suburb,
    city: a.city,
    landmark: a.landmark,
    isDefault: user?.defaultAddressId === a.id,
  };
}

function paged<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function pageParams(q: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(q.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(q.get('pageSize') ?? '20', 10) || 20));
  return { page, pageSize };
}

// ───────────────────────────── Simulated order progress ─────────────────────────────

/** Seconds after PLACED at which each step happens in the demo. */
const DELIVERY_STEPS: Array<{ at: number; status?: OrderStatus; rider?: true; message: string }> = [
  { at: 8, status: 'ACCEPTED', message: 'The store accepted your order' },
  { at: 14, rider: true, message: 'A rider is on the way to the store' },
  { at: 22, status: 'READY_FOR_PICKUP', message: 'Your order is ready for pickup' },
  { at: 30, status: 'PICKED_UP', message: 'The rider picked up your order' },
  { at: 38, status: 'ON_THE_WAY', message: 'Your order is on the way' },
  { at: 80, status: 'DELIVERED', message: 'Delivered' },
];
const PARCEL_STEPS: typeof DELIVERY_STEPS = [
  { at: 6, rider: true, message: 'A rider is on the way to collect your parcel' },
  { at: 16, status: 'PICKED_UP', message: 'The rider collected your parcel' },
  { at: 24, status: 'ON_THE_WAY', message: 'Your parcel is on the way' },
  { at: 60, status: 'DELIVERED', message: 'Delivered' },
];
const TIMESTAMP_FOR: Partial<Record<OrderStatus, keyof CustomerOrder['timestamps']>> = {
  ACCEPTED: 'acceptedAt',
  READY_FOR_PICKUP: 'readyAt',
  PICKED_UP: 'pickedUpAt',
  ON_THE_WAY: 'onTheWayAt',
  DELIVERED: 'deliveredAt',
};
const TERMINAL: OrderStatus[] = ['DELIVERED', 'REJECTED', 'CANCELLED'];

function steps(o: OrderRecord) {
  return o.type === 'PARCEL' ? PARCEL_STEPS : DELIVERY_STEPS;
}

function advanceOrder(db: DemoDb, o: OrderRecord, now: number): void {
  if (o.placedAtMs === null || TERMINAL.includes(o.status)) return;
  for (const step of steps(o)) {
    const at = o.placedAtMs + step.at * 1000;
    if (at > now) break;
    const iso = new Date(at).toISOString();
    if (step.rider && !o.riderId) {
      o.riderId = DEMO_RIDERS[0].id;
      o.timestamps.assignedAt = iso;
      o.events!.push({ id: nextId(db, 'ev'), type: 'RIDER_ASSIGNED', status: null, message: step.message, createdAt: iso });
    }
    if (step.status && !o.timestamps[TIMESTAMP_FOR[step.status]!]) {
      o.status = step.status;
      o.timestamps[TIMESTAMP_FOR[step.status]!] = iso;
      o.events!.push({ id: nextId(db, 'ev'), type: 'STATUS', status: step.status, message: step.message, createdAt: iso });
      if (step.status === 'DELIVERED' && o.paymentMethod === 'CASH') o.paymentStatus = 'PAID';
    }
  }
}

function elapsedSeconds(o: OrderRecord, now: number): number {
  return o.placedAtMs === null ? 0 : (now - o.placedAtMs) / 1000;
}

function riderLocation(o: OrderRecord, now: number): { lat: number; lng: number } | null {
  if (!o.riderId || TERMINAL.includes(o.status)) return null;
  const list = steps(o);
  const departAt = list.find((s) => s.status === 'ON_THE_WAY')!.at;
  const arriveAt = list[list.length - 1].at;
  const t = elapsedSeconds(o, now);
  if (t < departAt) return { lat: o.pickup.lat + 0.0015, lng: o.pickup.lng - 0.001 };
  const p = Math.min(1, (t - departAt) / (arriveAt - departAt));
  return { lat: o.pickup.lat + (o.dropoff.lat - o.pickup.lat) * p, lng: o.pickup.lng + (o.dropoff.lng - o.pickup.lng) * p };
}

function etaMinutes(o: OrderRecord, now: number): number | null {
  if (TERMINAL.includes(o.status) || o.status === 'PENDING_PAYMENT') return null;
  const total = steps(o)[steps(o).length - 1].at;
  const remaining = Math.max(0, total - elapsedSeconds(o, now)) / total;
  return Math.max(1, Math.ceil(o.etaMinutes * remaining));
}

/** Applies everything time-based: payments settling and orders progressing. */
function tick(db: DemoDb, now: number): void {
  for (const p of db.payments) {
    if (p.status !== 'PENDING' || now - Date.parse(p.createdAt) < PAYMENT_SETTLE_MS) continue;
    p.status = 'PAID';
    p.paidAt = new Date(Date.parse(p.createdAt) + PAYMENT_SETTLE_MS).toISOString();
    const order = db.orders.find((o) => o.id === p.orderId);
    if (!order) continue;
    if (p.purpose === 'ORDER' && order.status === 'PENDING_PAYMENT') {
      order.status = 'PLACED';
      order.paymentStatus = 'PAID';
      order.placedAtMs = Date.parse(p.paidAt);
      order.timestamps.placedAt = p.paidAt;
      order.events!.push({ id: nextId(db, 'ev'), type: 'PAYMENT', status: 'PLACED', message: 'Payment received — order sent to the store', createdAt: p.paidAt });
    }
    if (p.purpose === 'TIP') {
      order.events!.push({ id: nextId(db, 'ev'), type: 'TIP', status: null, message: `Tip of US$${(p.amountUsdCents / 100).toFixed(2)} sent to the rider`, createdAt: p.paidAt });
    }
  }
  for (const o of db.orders) advanceOrder(db, o, now);
}

function presentOrder(db: DemoDb, o: OrderRecord, now: number): CustomerOrder {
  const v = o.vendorId ? vendorById(o.vendorId) : undefined;
  const rider = o.riderId ? DEMO_RIDERS.find((r) => r.id === o.riderId) : undefined;
  const loc = riderLocation(o, now);
  const payment = [...db.payments].reverse().find((p) => p.orderId === o.id && p.purpose === 'ORDER');
  const { userId: _u, vendorId: _v, riderId: _r, placedAtMs: _p, etaMinutes: _e, ...rest } = o;
  return {
    ...structuredClone(rest),
    statusLabel: ORDER_STATUS_LABEL[o.status],
    vendor: v ? { id: v.id, name: v.name, phone: v.phone, logoUrl: null, lat: v.lat, lng: v.lng, addressLine: v.addressLine, landmark: v.landmark } : null,
    rider: rider
      ? {
          id: rider.id,
          name: rider.name,
          phone: rider.phone,
          vehicleType: rider.vehicleType,
          vehicleDescription: rider.vehicleDescription,
          vehiclePlate: rider.vehiclePlate,
          ratingAvg: rider.ratingAvg,
          location: loc ? { ...loc, heading: null, updatedAt: new Date(now).toISOString() } : null,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          method: payment.method,
          status: payment.status,
          currency: payment.currency,
          amountCents: payment.amountCents,
          paynowReference: payment.reference,
          redirectUrl: payment.redirectUrl,
          instructions: payment.instructions,
        }
      : null,
    proof: o.status === 'DELIVERED' ? { type: 'PIN', photoUrl: null } : null,
    canRate: o.status === 'DELIVERED' && o.ratings!.length < (o.type === 'PARCEL' ? 1 : 2),
  };
}

// ───────────────────────────── Seed & storage ─────────────────────────────

function seed(now: number): DemoDb {
  const db: DemoDb = { version: 1, seq: 0, users: [], addresses: [], orders: [], payments: [], messages: [], stockUsed: {}, reviews: {} };
  const user: DemoUser = {
    id: 'u-demo',
    phone: DEMO_CUSTOMER.phone,
    name: DEMO_CUSTOMER.name,
    email: null,
    preferredCurrency: 'USD',
    notificationChannel: 'SMS',
    defaultAddressId: null,
  };
  db.users.push(user);
  for (const a of DEMO_CUSTOMER.addresses) {
    const id = nextId(db, 'addr');
    db.addresses.push({ id, userId: user.id, deleted: false, ...a });
    user.defaultAddressId ??= id;
  }
  // One past order so the history and "Order again" have something to show.
  const v = DEMO_VENDORS[0];
  const home = db.addresses[0];
  const products = productsOf(db, v);
  const items = [
    { p: products[0], q: 2 },
    { p: products[4], q: 1 },
  ];
  const km = roadDistanceKm({ lat: v.lat, lng: v.lng }, home);
  const subtotal = items.reduce((s, i) => s + i.p.priceCents * i.q, 0);
  const fee = deliveryFee(km);
  const created = now - 2 * 24 * 3600 * 1000;
  const iso = (offsetMin: number) => new Date(created + offsetMin * 60_000).toISOString();
  db.orders.push({
    id: nextId(db, 'ord'),
    code: 'DS-7KQ2PX',
    userId: user.id,
    type: 'DELIVERY',
    status: 'DELIVERED',
    vendorId: v.id,
    riderId: DEMO_RIDERS[1].id,
    pickup: { lat: v.lat, lng: v.lng, address: v.addressLine, landmark: v.landmark, contactName: v.name },
    dropoff: { lat: home.lat, lng: home.lng, address: [home.street, home.suburb, home.city].filter(Boolean).join(', '), landmark: home.landmark, recipientName: user.name },
    parcel: null,
    distanceKm: km,
    items: items.map((i) => ({ id: nextId(db, 'item'), productId: i.p.id, name: i.p.name, unitPriceCents: i.p.priceCents, quantity: i.q, lineTotalCents: i.p.priceCents * i.q, notes: null })),
    amounts: { subtotalCents: subtotal, deliveryFeeCents: fee, tipCents: 0, totalCents: subtotal + fee, currency: 'USD', exchangeRate: 1, totalLocalCents: subtotal + fee },
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    notes: null,
    prepMinutes: 20,
    estimatedReadyAt: iso(22),
    cancelReason: null,
    rejectReason: null,
    ratings: [],
    dispute: null,
    timestamps: {
      createdAt: iso(0),
      placedAt: iso(0),
      acceptedAt: iso(2),
      readyAt: iso(21),
      assignedAt: iso(5),
      pickedUpAt: iso(23),
      onTheWayAt: iso(24),
      deliveredAt: iso(38),
      cancelledAt: null,
    },
    events: [],
    deliveryPin: '4821',
    placedAtMs: null,
    etaMinutes: 0,
  });
  return db;
}

function load(now: number): DemoDb {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      if (db.version === 1 && Array.isArray(db.orders)) return db;
    }
  } catch {
    // Corrupt or blocked storage: start fresh.
  }
  return seed(now);
}

function save(db: DemoDb): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage blocked: the demo still works until the page reloads.
  }
}

/** Clears all demo data (and the signed-in session). */
export function resetDemoData(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ───────────────────────────── Request handling ─────────────────────────────

interface Ctx {
  db: DemoDb;
  now: number;
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
  token: string | null;
}

function currentUser(ctx: Ctx): DemoUser {
  const id = ctx.token?.startsWith('demo.') ? ctx.token.split('.')[1] : null;
  const user = id ? ctx.db.users.find((u) => u.id === id) : undefined;
  if (!user) throw unauthorized();
  return user;
}

function session(db: DemoDb, user: DemoUser) {
  const nonce = Math.random().toString(36).slice(2);
  return { accessToken: `demo.${user.id}.${nonce}`, refreshToken: `demo-refresh.${user.id}.${nonce}`, user: profile(user) };
}

function ownOrder(ctx: Ctx, id: string): OrderRecord {
  const user = currentUser(ctx);
  const order = ctx.db.orders.find((o) => o.id === id && o.userId === user.id);
  if (!order) throw notFound('Order');
  return order;
}

function ownAddress(ctx: Ctx, id: string): DemoAddress {
  const user = currentUser(ctx);
  const a = ctx.db.addresses.find((x) => x.id === id && x.userId === user.id && !x.deleted);
  if (!a) throw notFound('Address');
  return a;
}

/** Resolves the drop-off from a saved address id. */
function dropoffFrom(ctx: Ctx, user: DemoUser) {
  const addressId = ctx.body.addressId;
  if (typeof addressId !== 'string' || !addressId) throw new DemoError(400, 'VALIDATION_ERROR', 'addressId: Choose a delivery address');
  const a = ownAddress(ctx, addressId);
  return {
    lat: a.lat,
    lng: a.lng,
    address: [a.street, a.suburb, a.city].filter(Boolean).join(', ') || a.city,
    landmark: a.landmark,
    recipientName: user.name,
  };
}

function currencyOf(ctx: Ctx, user: DemoUser): Currency {
  const c = ctx.body.currency;
  return c === 'USD' || c === 'ZWG' ? c : user.preferredCurrency;
}

function tipOf(ctx: Ctx): number {
  const tip = ctx.body.tipCents ?? 0;
  if (typeof tip !== 'number' || !Number.isInteger(tip) || tip < 0) throw new DemoError(400, 'VALIDATION_ERROR', 'tipCents: Invalid tip');
  if (tip > DEMO_SETTINGS.maxTipCents) throw badRequest(`Tips are limited to US$${(DEMO_SETTINGS.maxTipCents / 100).toFixed(2)} per order.`);
  return tip;
}

function money(totalCents: number, currency: Currency) {
  const exchangeRate = currency === 'ZWG' ? DEMO_SETTINGS.zigPerUsd : 1;
  return { currency, exchangeRate, totalLocalCents: Math.round(totalCents * exchangeRate) };
}

function vendorQuote(ctx: Ctx, user: DemoUser) {
  const v = typeof ctx.body.vendorId === 'string' ? vendorById(ctx.body.vendorId) : undefined;
  if (!v) throw notFound('Store');
  const rawItems = ctx.body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw badRequest('Your cart is empty');
  const products = productsOf(ctx.db, v);
  const lines = rawItems.map((raw) => {
    const item = raw as { productId?: unknown; quantity?: unknown; notes?: unknown };
    const p = products.find((x) => x.id === item.productId);
    if (!p) throw conflict('An item in your cart is no longer on the menu. Remove it and try again.');
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw badRequest('Invalid quantity');
    if (!p.isAvailable) throw conflict(`${p.name} is sold out.`);
    if (p.stockQty !== null && quantity > p.stockQty) throw conflict(`Only ${p.stockQty} × ${p.name} left.`);
    return { productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity, lineTotalCents: p.priceCents * quantity, notes: text(item.notes, 'notes', 200, false) ?? null };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  if (subtotalCents < v.minOrderCents) throw conflict(`${v.name} has a minimum order of US$${(v.minOrderCents / 100).toFixed(2)}.`);
  const dropoff = dropoffFrom(ctx, user);
  const d = delivery(v, dropoff);
  if (!d.deliverable) throw conflict(`${v.name} doesn't deliver that far (${d.distanceKm.toFixed(1)} km; the limit is ${DEMO_SETTINGS.maxDeliveryKm} km).`);
  const tipCents = tipOf(ctx);
  const totalCents = subtotalCents + d.deliveryFeeCents + tipCents;
  const currency = currencyOf(ctx, user);
  return {
    v,
    dropoff,
    quote: {
      lines: lines.map(({ notes: _n, ...l }) => l),
      subtotalCents,
      deliveryFeeCents: d.deliveryFeeCents,
      tipCents,
      totalCents,
      ...money(totalCents, currency),
      distanceKm: d.distanceKm,
      etaMinutes: d.etaMinutes,
    },
    lines,
  };
}

function parcelQuote(ctx: Ctx, user: DemoUser) {
  const pickupRaw = (ctx.body.pickup ?? {}) as Record<string, unknown>;
  const pickupPoint = latLng(pickupRaw.lat, pickupRaw.lng);
  const pickup = {
    ...pickupPoint,
    address: text(pickupRaw.address, 'pickup.address', 160)!,
    landmark: text(pickupRaw.landmark, 'pickup.landmark', 200)!,
    contactName: text(pickupRaw.contactName, 'pickup.contactName', 80, false) ?? null,
    contactPhone: pickupRaw.contactPhone ? requirePhone(pickupRaw.contactPhone, 'pickup.contactPhone') : null,
  };
  const recipientName = text(ctx.body.recipientName, 'recipientName', 80)!;
  const recipientPhone = requirePhone(ctx.body.recipientPhone, 'recipientPhone');
  const description = text(ctx.body.description, 'description', 200)!;
  const rawSize = ctx.body.size;
  if (rawSize !== 'SMALL' && rawSize !== 'MEDIUM' && rawSize !== 'LARGE') throw new DemoError(400, 'VALIDATION_ERROR', 'size: Choose a parcel size');
  const size: 'SMALL' | 'MEDIUM' | 'LARGE' = rawSize;
  const dropoff = { ...dropoffFrom(ctx, user), recipientName };
  const distanceKm = roadDistanceKm(pickup, dropoff);
  if (distanceKm > DEMO_SETTINGS.maxDeliveryKm) throw conflict(`Parcels can travel up to ${DEMO_SETTINGS.maxDeliveryKm} km; this one is ${distanceKm.toFixed(1)} km.`);
  const deliveryFeeCents = deliveryFee(distanceKm) + DEMO_SETTINGS.parcelSurchargeCents[size];
  const tipCents = tipOf(ctx);
  const totalCents = deliveryFeeCents + tipCents;
  return {
    pickup,
    dropoff,
    recipientPhone,
    parcel: { description, size },
    quote: {
      subtotalCents: 0,
      deliveryFeeCents,
      tipCents,
      totalCents,
      ...money(totalCents, currencyOf(ctx, user)),
      distanceKm,
      etaMinutes: 10 + travelMinutes(distanceKm),
    },
  };
}

function paymentMethodOf(value: unknown, allowCash: boolean): PaymentMethod {
  if (value === 'ECOCASH' || value === 'ONEMONEY' || value === 'CARD' || (allowCash && value === 'CASH')) return value;
  throw new DemoError(400, 'VALIDATION_ERROR', 'paymentMethod: Choose how to pay');
}

function startPayment(ctx: Ctx, order: OrderRecord, purpose: 'ORDER' | 'TIP', method: Exclude<PaymentMethod, 'CASH'>, amountUsdCents: number, payerPhone: unknown): DemoPayment {
  const user = currentUser(ctx);
  if (method !== 'CARD') requirePhone(payerPhone ?? user.phone, 'payerPhone');
  const currency = order.amounts.currency;
  const rate = currency === 'ZWG' ? DEMO_SETTINGS.zigPerUsd : 1;
  const label = method === 'ECOCASH' ? 'EcoCash' : method === 'ONEMONEY' ? 'OneMoney' : 'Card';
  const payment: DemoPayment = {
    id: nextId(ctx.db, 'pay'),
    userId: user.id,
    orderId: order.id,
    purpose,
    method,
    status: 'PENDING',
    currency,
    amountCents: Math.round(amountUsdCents * rate),
    amountUsdCents,
    reference: randomCode(10, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'),
    redirectUrl: null,
    instructions: `Demo: ${label} payment is simulated and will be approved in a few seconds.`,
    paidAt: null,
    createdAt: new Date(ctx.now).toISOString(),
  };
  // A new attempt replaces any pending one.
  for (const p of ctx.db.payments) if (p.orderId === order.id && p.purpose === purpose && p.status === 'PENDING') p.status = 'CANCELLED';
  ctx.db.payments.push(payment);
  return payment;
}

function presentPayment(p: DemoPayment): PaymentInfo {
  const { userId: _u, ...rest } = p;
  return { ...rest };
}

function createOrder(
  ctx: Ctx,
  user: DemoUser,
  data: Pick<OrderRecord, 'type' | 'vendorId' | 'pickup' | 'dropoff' | 'parcel' | 'distanceKm' | 'items' | 'prepMinutes'> & {
    quote: { subtotalCents: number; deliveryFeeCents: number; tipCents: number; totalCents: number; currency: Currency; exchangeRate: number; totalLocalCents: number; etaMinutes: number };
  },
) {
  const method = paymentMethodOf(ctx.body.paymentMethod, true);
  const iso = new Date(ctx.now).toISOString();
  const placed = method === 'CASH';
  const order: OrderRecord = {
    id: nextId(ctx.db, 'ord'),
    code: `DS-${randomCode(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`,
    userId: user.id,
    type: data.type,
    status: placed ? 'PLACED' : 'PENDING_PAYMENT',
    vendorId: data.vendorId,
    riderId: null,
    pickup: data.pickup,
    dropoff: data.dropoff,
    parcel: data.parcel,
    distanceKm: data.distanceKm,
    items: data.items,
    amounts: {
      subtotalCents: data.quote.subtotalCents,
      deliveryFeeCents: data.quote.deliveryFeeCents,
      tipCents: data.quote.tipCents,
      totalCents: data.quote.totalCents,
      currency: data.quote.currency,
      exchangeRate: data.quote.exchangeRate,
      totalLocalCents: data.quote.totalLocalCents,
    },
    paymentMethod: method,
    paymentStatus: 'PENDING',
    notes: text(ctx.body.notes, 'notes', 300, false) ?? null,
    prepMinutes: data.prepMinutes,
    estimatedReadyAt: data.prepMinutes ? new Date(ctx.now + (8 + data.prepMinutes * 60) * 1000).toISOString() : null,
    cancelReason: null,
    rejectReason: null,
    ratings: [],
    dispute: null,
    timestamps: {
      createdAt: iso,
      placedAt: placed ? iso : null,
      acceptedAt: null,
      readyAt: null,
      assignedAt: null,
      pickedUpAt: null,
      onTheWayAt: null,
      deliveredAt: null,
      cancelledAt: null,
    },
    events: [{ id: nextId(ctx.db, 'ev'), type: 'CREATED', status: placed ? 'PLACED' : 'PENDING_PAYMENT', message: placed ? 'Order placed' : 'Waiting for payment', createdAt: iso }],
    deliveryPin: randomCode(4, '0123456789'),
    placedAtMs: placed ? ctx.now : null,
    etaMinutes: data.quote.etaMinutes,
  };
  ctx.db.orders.push(order);
  let payment: PaymentInfo | null = null;
  if (method !== 'CASH') payment = presentPayment(startPayment(ctx, order, 'ORDER', method, order.amounts.totalCents, ctx.body.payerPhone));
  return { order: presentOrder(ctx.db, order, ctx.now), payment, paymentError: null };
}

const RIDER_REPLIES = ['Thanks, noted!', 'On my way, see you soon.', 'I am about 5 minutes away.', 'I am at the gate now.'];

type Handler = (ctx: Ctx, params: string[]) => unknown;
const routes: Array<[method: string, pattern: RegExp, handler: Handler]> = [
  // ── Auth ──
  ['POST', /^\/auth\/otp\/request$/, (ctx) => {
    requirePhone(ctx.body.phone);
    return { expiresInSec: 300, devCode: DEMO_OTP };
  }],
  ['POST', /^\/auth\/otp\/verify$/, (ctx) => {
    const phone = requirePhone(ctx.body.phone);
    if (String(ctx.body.code ?? '').trim() !== DEMO_OTP) throw badRequest('That code is not right. In the demo the code is always 123456.');
    let user = ctx.db.users.find((u) => u.phone === phone);
    if (!user) {
      user = { id: nextId(ctx.db, 'u'), phone, name: text(ctx.body.name, 'name', 80, false) ?? null, email: null, preferredCurrency: 'USD', notificationChannel: 'SMS', defaultAddressId: null };
      ctx.db.users.push(user);
    }
    return session(ctx.db, user);
  }],
  ['POST', /^\/auth\/refresh$/, (ctx) => {
    const token = String(ctx.body.refreshToken ?? '');
    const user = token.startsWith('demo-refresh.') ? ctx.db.users.find((u) => u.id === token.split('.')[1]) : undefined;
    if (!user) throw unauthorized();
    const s = session(ctx.db, user);
    return { accessToken: s.accessToken, refreshToken: s.refreshToken };
  }],
  ['POST', /^\/auth\/logout$/, () => ({ ok: true })],
  ['GET', /^\/auth\/me$/, (ctx) => profile(currentUser(ctx))],
  ['PATCH', /^\/auth\/me$/, (ctx) => {
    const user = currentUser(ctx);
    const b = ctx.body;
    if (b.name !== undefined) {
      const name = text(b.name, 'name', 80)!;
      if (name.length < 2) throw new DemoError(400, 'VALIDATION_ERROR', 'name: At least 2 characters');
      user.name = name;
    }
    if (b.email !== undefined) {
      if (b.email !== null && (typeof b.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))) throw new DemoError(400, 'VALIDATION_ERROR', 'email: Enter a valid email');
      user.email = (b.email as string | null) ?? null;
    }
    if (b.preferredCurrency === 'USD' || b.preferredCurrency === 'ZWG') user.preferredCurrency = b.preferredCurrency;
    if (b.notificationChannel === 'SMS' || b.notificationChannel === 'WHATSAPP') user.notificationChannel = b.notificationChannel;
    return profile(user);
  }],

  // ── Catalogue ──
  ['GET', /^\/meta$/, () => ({ paymentsSimulated: true, smsSignIn: true })],
  ['GET', /^\/categories$/, () => DEMO_CATEGORIES],
  ['GET', /^\/vendors$/, (ctx) => {
    const q = ctx.query;
    const lat = q.get('lat');
    const lng = q.get('lng');
    const origin = lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null;
    const search = (q.get('q') ?? '').trim().toLowerCase();
    const category = q.get('category');
    let rows: VendorSummary[] = DEMO_VENDORS.filter((v) => !category || v.category === category)
      .filter(
        (v) =>
          !search ||
          v.name.toLowerCase().includes(search) ||
          v.description.toLowerCase().includes(search) ||
          v.menu.some((s) => s.items.some(([name]) => name.toLowerCase().includes(search))),
      )
      .map((v) => ({
        ...presentVendor(ctx.db, v),
        ...(origin ? delivery(v, origin) : { distanceKm: null, deliveryFeeCents: null, etaMinutes: null, deliverable: true }),
      }));
    if (origin) rows = rows.filter((r) => r.deliverable);
    const minRating = Number(q.get('minRating') ?? 0);
    if (minRating) rows = rows.filter((r) => r.ratingAvg >= minRating);
    const sort = q.get('sort') ?? 'recommended';
    rows.sort((a, b) => {
      if (sort === 'rating') return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      if (sort === 'distance') return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      if (sort === 'deliveryFee') return (a.deliveryFeeCents ?? 0) - (b.deliveryFeeCents ?? 0);
      const score = (r: VendorSummary) => r.ratingAvg * Math.min(1, r.ratingCount / 20) - (r.distanceKm ?? 0) * 0.05;
      return score(b) - score(a);
    });
    const { page, pageSize } = pageParams(q);
    return paged(rows, page, pageSize);
  }],
  ['GET', /^\/vendors\/([^/]+)\/reviews$/, (ctx, [id]) => {
    const v = vendorById(id);
    if (!v) throw notFound('Store');
    const base: Review[] = v.reviews.map(([customerName, score, comment, daysAgo], i) => ({
      id: `${v.id}-rev${i}`,
      score,
      comment,
      customerName,
      createdAt: new Date(ctx.now - daysAgo * 24 * 3600 * 1000).toISOString(),
    }));
    const all = [...(ctx.db.reviews[v.id] ?? []), ...base].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const { page, pageSize } = pageParams(ctx.query);
    return paged(all, page, pageSize);
  }],
  ['GET', /^\/vendors\/([^/]+)$/, (ctx, [id]) => {
    const v = vendorById(id);
    if (!v) throw notFound('Store');
    const lat = ctx.query.get('lat');
    const lng = ctx.query.get('lng');
    const products = productsOf(ctx.db, v);
    return {
      vendor: presentVendor(ctx.db, v),
      delivery: lat !== null && lng !== null ? delivery(v, { lat: Number(lat), lng: Number(lng) }) : null,
      sections: v.menu.map((s, si) => ({
        id: `${v.id}-s${si}`,
        name: s.section,
        products: products.filter((p) => p.sectionId === `${v.id}-s${si}`).map(({ sectionName: _s, ...p }) => p),
      })),
    };
  }],

  // ── Addresses ──
  ['GET', /^\/customer\/addresses$/, (ctx) => {
    const user = currentUser(ctx);
    return ctx.db.addresses.filter((a) => a.userId === user.id && !a.deleted).reverse().map((a) => presentAddress(ctx.db, a));
  }],
  ['POST', /^\/customer\/addresses$/, (ctx) => {
    const user = currentUser(ctx);
    const b = ctx.body;
    const point = latLng(b.lat, b.lng);
    const a: DemoAddress = {
      id: nextId(ctx.db, 'addr'),
      userId: user.id,
      deleted: false,
      label: text(b.label, 'label', 40, false) ?? 'Home',
      ...point,
      street: text(b.street, 'street', 120, false) ?? null,
      suburb: text(b.suburb, 'suburb', 80, false) ?? null,
      city: text(b.city, 'city', 60, false) ?? 'Harare',
      landmark: text(b.landmark, 'landmark', 200)!,
    };
    const hadAny = ctx.db.addresses.some((x) => x.userId === user.id && !x.deleted);
    ctx.db.addresses.push(a);
    if (b.makeDefault === true || !hadAny) user.defaultAddressId = a.id;
    return presentAddress(ctx.db, a);
  }],
  ['PATCH', /^\/customer\/addresses\/([^/]+)$/, (ctx, [id]) => {
    const user = currentUser(ctx);
    const a = ownAddress(ctx, id);
    const b = ctx.body;
    if (b.lat !== undefined || b.lng !== undefined) Object.assign(a, latLng(b.lat ?? a.lat, b.lng ?? a.lng));
    if (b.label !== undefined) a.label = text(b.label, 'label', 40, false) ?? a.label;
    if (b.street !== undefined) a.street = text(b.street, 'street', 120, false) ?? null;
    if (b.suburb !== undefined) a.suburb = text(b.suburb, 'suburb', 80, false) ?? null;
    if (b.city !== undefined) a.city = text(b.city, 'city', 60)!;
    if (b.landmark !== undefined) a.landmark = text(b.landmark, 'landmark', 200)!;
    if (b.makeDefault === true) user.defaultAddressId = a.id;
    return presentAddress(ctx.db, a);
  }],
  ['DELETE', /^\/customer\/addresses\/([^/]+)$/, (ctx, [id]) => {
    const user = currentUser(ctx);
    const a = ownAddress(ctx, id);
    a.deleted = true;
    if (user.defaultAddressId === a.id) user.defaultAddressId = null;
    return { ok: true };
  }],

  // ── Orders ──
  ['POST', /^\/orders\/quote$/, (ctx) => vendorQuote(ctx, currentUser(ctx)).quote],
  ['POST', /^\/orders\/parcel\/quote$/, (ctx) => parcelQuote(ctx, currentUser(ctx)).quote],
  ['POST', /^\/orders\/parcel$/, (ctx) => {
    const user = currentUser(ctx);
    const q = parcelQuote(ctx, user);
    return createOrder(ctx, user, {
      type: 'PARCEL',
      vendorId: null,
      pickup: q.pickup,
      dropoff: { ...q.dropoff, recipientPhone: q.recipientPhone },
      parcel: q.parcel,
      distanceKm: q.quote.distanceKm,
      items: [],
      prepMinutes: null,
      quote: q.quote,
    });
  }],
  ['POST', /^\/orders$/, (ctx) => {
    const user = currentUser(ctx);
    const { v, dropoff, quote, lines } = vendorQuote(ctx, user);
    const result = createOrder(ctx, user, {
      type: 'DELIVERY',
      vendorId: v.id,
      pickup: { lat: v.lat, lng: v.lng, address: v.addressLine, landmark: v.landmark, contactName: v.name },
      dropoff,
      parcel: null,
      distanceKm: quote.distanceKm,
      items: lines.map((l) => ({ id: nextId(ctx.db, 'item'), ...l })),
      prepMinutes: v.avgPrepMinutes,
      quote,
    });
    for (const l of lines) ctx.db.stockUsed[l.productId] = (ctx.db.stockUsed[l.productId] ?? 0) + l.quantity;
    return result;
  }],
  ['GET', /^\/orders$/, (ctx) => {
    const user = currentUser(ctx);
    const active = ctx.query.get('active');
    const isActive = (o: OrderRecord) => !TERMINAL.includes(o.status);
    const list = ctx.db.orders
      .filter((o) => o.userId === user.id)
      .filter((o) => (active === 'true' ? isActive(o) : active === 'false' ? !isActive(o) : true))
      .sort((a, b) => b.timestamps.createdAt.localeCompare(a.timestamps.createdAt))
      .map((o) => presentOrder(ctx.db, o, ctx.now));
    const { page, pageSize } = pageParams(ctx.query);
    return paged(list, page, pageSize);
  }],
  ['GET', /^\/orders\/([^/]+)\/tracking$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    const rider = o.riderId ? DEMO_RIDERS.find((r) => r.id === o.riderId) : undefined;
    const loc = riderLocation(o, ctx.now);
    return {
      orderId: o.id,
      status: o.status,
      rider: rider ? { name: rider.name, vehiclePlate: rider.vehiclePlate, location: loc ? { ...loc, heading: null, updatedAt: new Date(ctx.now).toISOString() } : null } : null,
      etaMinutes: etaMinutes(o, ctx.now),
      pickup: { lat: o.pickup.lat, lng: o.pickup.lng },
      dropoff: { lat: o.dropoff.lat, lng: o.dropoff.lng },
      updatedAt: new Date(ctx.now).toISOString(),
    };
  }],
  ['GET', /^\/orders\/([^/]+)\/messages$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    const user = currentUser(ctx);
    return ctx.db.messages
      .filter((m) => m.orderId === o.id && Date.parse(m.createdAt) <= ctx.now)
      .map((m): ChatMessage => ({ id: m.id, orderId: m.orderId, body: m.body, createdAt: m.createdAt, readAt: null, mine: m.senderId === user.id, senderId: m.senderId }));
  }],
  ['POST', /^\/orders\/([^/]+)\/messages$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    const user = currentUser(ctx);
    if (!o.riderId) throw conflict('Chat opens once a rider is assigned.');
    if (TERMINAL.includes(o.status)) throw conflict('This order is closed.');
    const body = text(ctx.body.body, 'body', 1000)!;
    const iso = new Date(ctx.now).toISOString();
    const mine: DemoMessage = { id: nextId(ctx.db, 'msg'), orderId: o.id, senderId: user.id, body, createdAt: iso };
    ctx.db.messages.push(mine);
    // The demo rider answers a few seconds later.
    const replies = ctx.db.messages.filter((m) => m.orderId === o.id && m.senderId === o.riderId).length;
    ctx.db.messages.push({
      id: nextId(ctx.db, 'msg'),
      orderId: o.id,
      senderId: o.riderId,
      body: RIDER_REPLIES[replies % RIDER_REPLIES.length],
      createdAt: new Date(ctx.now + RIDER_REPLY_MS).toISOString(),
    });
    return { id: mine.id, orderId: o.id, body, createdAt: iso, readAt: null, mine: true, senderId: user.id } satisfies ChatMessage;
  }],
  ['POST', /^\/orders\/([^/]+)\/cancel$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    if (o.status !== 'PENDING_PAYMENT' && o.status !== 'PLACED') {
      throw conflict('This order is already being prepared and can no longer be cancelled in the app. Please contact support.');
    }
    const iso = new Date(ctx.now).toISOString();
    const reason = text(ctx.body.reason, 'reason', 200, false);
    o.status = 'CANCELLED';
    o.cancelReason = reason ?? 'Cancelled by customer';
    o.timestamps.cancelledAt = iso;
    o.events!.push({ id: nextId(ctx.db, 'ev'), type: 'STATUS', status: 'CANCELLED', message: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer', createdAt: iso });
    for (const p of ctx.db.payments) if (p.orderId === o.id && p.status === 'PENDING') p.status = 'CANCELLED';
    return presentOrder(ctx.db, o, ctx.now);
  }],
  ['POST', /^\/orders\/([^/]+)\/pay$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    if (o.status !== 'PENDING_PAYMENT') throw conflict('This order does not need a payment.');
    const method = paymentMethodOf(ctx.body.method, false) as Exclude<PaymentMethod, 'CASH'>;
    o.paymentMethod = method;
    return presentPayment(startPayment(ctx, o, 'ORDER', method, o.amounts.totalCents, ctx.body.payerPhone));
  }],
  ['POST', /^\/orders\/([^/]+)\/tip$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    if (o.status !== 'DELIVERED' || !o.riderId) throw conflict('You can tip once your order has been delivered.');
    const amount = ctx.body.amountCents;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 50) throw badRequest('Minimum tip is US$0.50');
    if (amount > DEMO_SETTINGS.maxTipCents) throw badRequest(`Tips are limited to US$${(DEMO_SETTINGS.maxTipCents / 100).toFixed(2)} per order.`);
    const method = paymentMethodOf(ctx.body.method, false) as Exclude<PaymentMethod, 'CASH'>;
    return presentPayment(startPayment(ctx, o, 'TIP', method, amount, ctx.body.payerPhone));
  }],
  ['POST', /^\/orders\/([^/]+)\/rate$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    const user = currentUser(ctx);
    if (o.status !== 'DELIVERED') throw conflict('You can rate an order after it has been delivered.');
    const score = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined);
    const vendorScore = score(ctx.body.vendorScore);
    const riderScore = score(ctx.body.riderScore);
    if (vendorScore === undefined && riderScore === undefined) throw badRequest('Give at least one rating.');
    const already = new Set(o.ratings!.map((r) => r.target));
    if (vendorScore !== undefined && o.vendorId && !already.has('VENDOR')) {
      const comment = text(ctx.body.vendorComment, 'vendorComment', 500, false) ?? null;
      o.ratings!.push({ target: 'VENDOR', score: vendorScore, comment });
      (ctx.db.reviews[o.vendorId] ??= []).unshift({
        id: nextId(ctx.db, 'rev'),
        score: vendorScore,
        comment,
        customerName: user.name?.split(' ')[0] ?? 'Customer',
        createdAt: new Date(ctx.now).toISOString(),
      });
    }
    if (riderScore !== undefined && o.riderId && !already.has('RIDER')) {
      o.ratings!.push({ target: 'RIDER', score: riderScore, comment: text(ctx.body.riderComment, 'riderComment', 500, false) ?? null });
    }
    return { ok: true };
  }],
  ['POST', /^\/orders\/([^/]+)\/dispute$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    if (o.status === 'PENDING_PAYMENT') throw conflict('This order has not been placed yet.');
    if (o.dispute) throw conflict('A problem has already been reported for this order.');
    const reason = String(ctx.body.reason ?? '');
    const description = text(ctx.body.description, 'description', 1000)!;
    o.dispute = { id: nextId(ctx.db, 'dsp'), status: 'OPEN', reason, description, resolution: null, refundCents: null, createdAt: new Date(ctx.now).toISOString() };
    return o.dispute;
  }],
  ['POST', /^\/orders\/([^/]+)\/reorder$/, (ctx, [id]) => {
    const o = ownOrder(ctx, id);
    const v = o.vendorId ? vendorById(o.vendorId) : undefined;
    if (!v) throw badRequest('Parcel orders cannot be reordered.');
    const products = productsOf(ctx.db, v);
    const items: Array<{ productId: string; name: string; quantity: number; priceCents: number; priceChanged: boolean }> = [];
    const unavailable: string[] = [];
    for (const item of o.items) {
      const p = products.find((x) => x.id === item.productId);
      if (!p || !p.isAvailable) {
        unavailable.push(item.name);
        continue;
      }
      items.push({ productId: p.id, name: p.name, quantity: p.stockQty !== null ? Math.min(item.quantity, p.stockQty) : item.quantity, priceCents: p.priceCents, priceChanged: p.priceCents !== item.unitPriceCents });
    }
    return { vendorId: v.id, vendorName: v.name, items, unavailable };
  }],
  ['GET', /^\/orders\/([^/]+)$/, (ctx, [id]) => presentOrder(ctx.db, ownOrder(ctx, id), ctx.now)],

  // ── Payments ──
  ['GET', /^\/payments\/([^/]+)$/, (ctx, [id]) => {
    const user = currentUser(ctx);
    const p = ctx.db.payments.find((x) => x.id === id && x.userId === user.id);
    if (!p) throw notFound('Payment');
    return presentPayment(p);
  }],
];

function handle(ctx: Ctx): { status: number; body: unknown } {
  const route = routes.find(([m, re]) => m === ctx.method && re.test(ctx.path));
  if (!route) return { status: 404, body: { error: { code: 'NOT_FOUND', message: `Route ${ctx.method} ${ctx.path} not found (demo)` } } };
  try {
    const params = (route[1].exec(ctx.path) ?? []).slice(1).map(decodeURIComponent);
    const result = route[2](ctx, params);
    return { status: ctx.method === 'POST' && /^\/(orders(\/parcel)?|customer\/addresses)$/.test(ctx.path) ? 201 : 200, body: result };
  } catch (err) {
    if (err instanceof DemoError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
    return { status: 500, body: { error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Demo error' } } };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Routes the website's API calls to the in-browser demo. Call once, as early as possible. */
export function installDemoApi(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __doorstepDemo?: boolean };
  if (w.__doorstepDemo) return;
  w.__doorstepDemo = true;
  const realFetch = window.fetch.bind(window);
  const prefix = `${config.apiUrl}/api/v1`;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(prefix)) return realFetch(input, init);

    // A little latency so loading states look like the real thing.
    await sleep(120 + Math.random() * 180);
    const parsed = new URL(url);
    const headers = new Headers(init?.headers);
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return new Response(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }
    const now = Date.now();
    // Load → handle → save with no awaits in between, so concurrent requests don't clobber each other.
    const db = load(now);
    tick(db, now);
    const result = handle({
      db,
      now,
      method: (init?.method ?? 'GET').toUpperCase(),
      path: parsed.pathname.slice(new URL(prefix).pathname.length) || '/',
      query: parsed.searchParams,
      body,
      token: headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null,
    });
    save(db);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  };
}
