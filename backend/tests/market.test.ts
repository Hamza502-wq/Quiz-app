import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { drainBackgroundTasks } from '../src/lib/background';
import { parseQuery } from '../src/modules/market/query-parser';
import { setAiInterpreterForTests } from '../src/modules/market/ai-search';
import { closeEndedAuctions } from '../src/modules/market/auction.service';
import { bidIncrementCents } from '../src/modules/market/market.constants';
import { api, app, auth, login, resetDb, seedWorld, waitFor, type Session } from './helpers';

const HARARE = { lat: -17.8292, lng: 31.0522 };
const MBARE = { lat: -17.8631, lng: 31.0388 };
const BULAWAYO = { lat: -20.1325, lng: 28.6265 };

const PHONES = {
  seller: '+263775000401',
  buyer: '+263775000402',
  third: '+263775000403',
  far: '+263775000404',
};

let seller: Session;
let buyer: Session;
let third: Session;
let admin: Session;
let photoUrl: string;
let buyerPhotoUrl: string;

async function uploadPhoto(s: Session): Promise<string> {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#2E7D32' } }).png().toBuffer();
  const res = await api().post('/api/v1/uploads').query({ kind: 'listing' }).set(auth(s)).attach('file', png, 'item.png');
  expect(res.status).toBe(201);
  return res.body.url as string;
}

async function setUpSeller(s: Session, name: string, where = HARARE, extra: Record<string, unknown> = {}) {
  const res = await api()
    .put('/api/v1/market/me/seller')
    .set(auth(s))
    .send({ displayName: name, area: 'Avondale', city: 'Harare', ...where, ...extra });
  expect(res.status).toBe(200);
  return res.body.seller;
}

async function createListing(s: Session, body: Record<string, unknown>) {
  const res = await api().post('/api/v1/market/listings').set(auth(s)).send(body);
  if (res.status !== 201) throw new Error(`Create listing failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; seller: { id: string } } & Record<string, unknown>;
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

beforeAll(async () => {
  await resetDb();
  await seedWorld();
  seller = await login(PHONES.seller, 'CUSTOMER', 'Chipo Ndlovu');
  buyer = await login(PHONES.buyer, 'CUSTOMER', 'Tatenda Moyo');
  third = await login(PHONES.third, 'CUSTOMER', 'Farai Banda');
  admin = await login('+263770000001', 'ADMIN');
  photoUrl = await uploadPhoto(seller);
  buyerPhotoUrl = await uploadPhoto(buyer);
});

afterEach(() => setAiInterpreterForTests(null));

afterAll(async () => {
  await prisma.$disconnect();
});

describe('search phrase parser (English and Shona)', () => {
  it('understands everyday phrases', () => {
    const plumber = parseQuery('cheapest plumber near me');
    expect(plumber).toMatchObject({ category: 'plumbing', kind: 'SERVICE', nearMe: true, sort: 'price_asc', source: 'rules', language: 'en' });

    const foni = parseQuery('ndiri kutsvaga foni yakachipa pasi pe$100 kuMbare');
    expect(foni).toMatchObject({ category: 'phones', maxPriceCents: 10_000, area: 'Mbare', sort: 'price_asc', language: 'sn' });
    expect(foni.keywords).toContain('phone');

    expect(parseQuery('munhu anogadzira mapombi pedyo neni')).toMatchObject({ category: 'plumbing', nearMe: true });
    expect(parseQuery('used cars in Bulawayo under $5k')).toMatchObject({ category: 'vehicles', condition: 'USED', maxPriceCents: 500_000, area: 'Bulawayo' });
    expect(parseQuery('brand new iphone 13 between $400 and $600')).toMatchObject({ condition: 'NEW', minPriceCents: 40_000, maxPriceCents: 60_000 });
    expect(parseQuery('auction ending soon')).toMatchObject({ saleType: 'AUCTION', sort: 'ending_soon' });
    expect(parseQuery('swap my laptop for a phone')).toMatchObject({ barter: true });
    // A number of people is not a price.
    expect(parseQuery('tent hire for 50 people')).toMatchObject({ category: 'events', maxPriceCents: null, minPriceCents: null });
    expect(parseQuery('sofa $2,000')).toMatchObject({ maxPriceCents: 200_000 });
  });

  it('uses bid steps that grow with the price', () => {
    expect(bidIncrementCents(1_000)).toBe(50);
    expect(bidIncrementCents(5_000)).toBe(100);
    expect(bidIncrementCents(50_000)).toBe(500);
    expect(bidIncrementCents(500_000)).toBe(1_000);
  });
});

describe('seller storefronts and listings', () => {
  it('needs a seller profile and validates every field', async () => {
    const early = await api().post('/api/v1/market/listings').set(auth(seller)).send({
      kind: 'ITEM', title: 'Samsung A14', description: 'Good phone, 64GB, with charger', category: 'phones', condition: 'GOOD', priceCents: 9000, photos: [photoUrl],
    });
    expect(early.status).toBe(409);

    expect((await api().get('/api/v1/market/me/seller')).status).toBe(401);
    const badProfile = await api().put('/api/v1/market/me/seller').set(auth(seller)).send({ displayName: 'C', area: 'Avondale', city: 'Harare', lat: 200, lng: 31 });
    expect(badProfile.status).toBe(400);

    const profile = await setUpSeller(seller, "Chipo's Corner", HARARE, { bio: 'Phones and more', whatsappPhone: '0775 000 401' });
    expect(profile).toMatchObject({ displayName: "Chipo's Corner", whatsappPhone: '+263775000401', showWhatsapp: true });

    const base = { kind: 'ITEM', title: 'Samsung A14', description: 'Good phone, 64GB, with charger', category: 'phones', condition: 'GOOD', priceCents: 9000 };
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [] })).status).toBe(400);
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: ['https://evil.example.com/x.webp'] })).status).toBe(400);
    // Another user's upload path that doesn't exist on this server.
    expect(
      (await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: ['http://localhost:4000/uploads/public/listing/0123456789abcdef01234567.webp'] })).status,
    ).toBe(400);
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [photoUrl], condition: undefined })).status).toBe(400);
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [photoUrl], category: 'plumbing' })).status).toBe(400);
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [photoUrl], title: '<' })).status).toBe(400);
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [photoUrl], priceCents: -5 })).status).toBe(400);
    // Services can't be auctions; auctions don't take swaps.
    expect(
      (await api().post('/api/v1/market/listings').set(auth(seller)).send({ kind: 'SERVICE', title: 'Plumbing', description: 'Burst pipes fixed fast', category: 'plumbing', priceCents: 2000, saleType: 'AUCTION', auctionEndsAt: inMinutes(60) })).status,
    ).toBe(400);
    expect(
      (await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [photoUrl], saleType: 'AUCTION', auctionEndsAt: inMinutes(60), openToBarter: true })).status,
    ).toBe(400);
    expect((await api().post('/api/v1/market/listings').set(auth(seller)).send({ ...base, photos: [photoUrl], saleType: 'AUCTION', auctionEndsAt: inMinutes(1) })).status).toBe(400);
  });

  it('adds, edits, marks sold, relists and deletes from the dashboard', async () => {
    const created = await createListing(seller, {
      kind: 'ITEM', title: 'Samsung A14', description: 'Good phone, 64GB, with charger', category: 'phones', condition: 'GOOD', priceCents: 9000, photos: [photoUrl],
    });
    expect(created).toMatchObject({ status: 'ACTIVE', area: 'Avondale', viewer: { isOwner: true } });
    expect((created.photos as Array<{ thumbUrl: string }>)[0].thumbUrl).toMatch(/-sm\.webp$/);

    const edited = await api().patch(`/api/v1/market/listings/${created.id}`).set(auth(seller)).send({ priceCents: 8500, openToBarter: true });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ priceCents: 8500, openToBarter: true });

    // Only the seller can change it.
    expect((await api().patch(`/api/v1/market/listings/${created.id}`).set(auth(buyer)).send({ priceCents: 1 })).status).toBe(403);
    expect((await api().delete(`/api/v1/market/listings/${created.id}`).set(auth(buyer))).status).toBe(403);

    const mine = await api().get('/api/v1/market/me/listings').set(auth(seller));
    expect(mine.body.items.map((l: { id: string }) => l.id)).toContain(created.id);

    expect((await api().post(`/api/v1/market/listings/${created.id}/sold`).set(auth(seller))).body.status).toBe('SOLD');
    expect((await api().post(`/api/v1/market/listings/${created.id}/sold`).set(auth(seller))).status).toBe(409);
    expect((await api().post(`/api/v1/market/listings/${created.id}/relist`).set(auth(seller))).body.status).toBe('ACTIVE');

    expect((await api().delete(`/api/v1/market/listings/${created.id}`).set(auth(seller))).status).toBe(200);
    expect((await api().get(`/api/v1/market/listings/${created.id}`)).status).toBe(404);
    expect((await api().get(`/api/v1/market/listings/${created.id}`).set(auth(seller))).body.status).toBe('REMOVED');
  });

  it('shows the WhatsApp number to signed-in buyers only, and only when the seller allows it', async () => {
    const l = await createListing(seller, {
      kind: 'ITEM', title: 'Wooden coffee table', description: 'Solid mukwa wood table', category: 'home', condition: 'LIKE_NEW', priceCents: 6000, photos: [photoUrl],
    });
    const anon = await api().get(`/api/v1/market/listings/${l.id}`);
    expect(anon.status).toBe(200);
    expect(anon.body.viewer).toBeNull();
    expect(JSON.stringify(anon.body)).not.toContain('775000401');

    const signedIn = await api().get(`/api/v1/market/listings/${l.id}`).set(auth(buyer));
    expect(signedIn.body.viewer).toMatchObject({ isOwner: false, whatsappPhone: '263775000401' });

    await setUpSeller(seller, "Chipo's Corner", HARARE, { whatsappPhone: '0775 000 401', showWhatsapp: false });
    expect((await api().get(`/api/v1/market/listings/${l.id}`).set(auth(buyer))).body.viewer.whatsappPhone).toBeNull();
    await setUpSeller(seller, "Chipo's Corner", HARARE, { whatsappPhone: '0775 000 401', showWhatsapp: true });

    const store = await api().get(`/api/v1/market/sellers/${l.seller.id}`).set(auth(buyer));
    expect(store.status).toBe(200);
    expect(store.body.seller).toMatchObject({ displayName: "Chipo's Corner", isYou: false, following: false });
    expect(store.body.listings.items.map((x: { id: string }) => x.id)).toContain(l.id);
  });
});

describe('DoorStep AI Search', () => {
  beforeAll(async () => {
    await setUpSeller(third, 'Farai Plumbing', HARARE);
    await createListing(third, { kind: 'SERVICE', title: 'Plumber: burst pipes and geysers', description: 'Fast plumbing repairs, call any time', category: 'plumbing', priceCents: 2500 });
    await createListing(third, { kind: 'SERVICE', title: 'Budget plumber', description: 'Leaking taps and toilets fixed', category: 'plumbing', priceCents: 1500, lat: MBARE.lat, lng: MBARE.lng, area: 'Mbare' });
    await createListing(seller, { kind: 'ITEM', title: 'Itel A70 phone', description: 'Cheap smartphone in good condition', category: 'phones', condition: 'GOOD', priceCents: 7000, photos: [photoUrl], area: 'Mbare', ...MBARE });
    await createListing(seller, { kind: 'ITEM', title: 'iPhone 11', description: 'Clean iPhone, battery 85%', category: 'phones', condition: 'GOOD', priceCents: 15000, photos: [photoUrl], area: 'Mbare', ...MBARE });
    await createListing(seller, { kind: 'ITEM', title: 'Nokia phone', description: 'Basic phone that lasts days', category: 'phones', condition: 'FAIR', priceCents: 2000, photos: [photoUrl], area: 'Bulawayo CBD', city: 'Bulawayo', ...BULAWAYO });
  });

  it('finds the cheapest plumber near me', async () => {
    const res = await api().get('/api/v1/market/search').query({ q: 'cheapest plumber near me', ...HARARE });
    expect(res.status).toBe(200);
    expect(res.body.interpretation).toMatchObject({ category: 'plumbing', nearMe: true, source: 'rules' });
    expect(res.body.items.map((l: { title: string }) => l.title)).toEqual(['Budget plumber', 'Plumber: burst pipes and geysers']);
    expect(res.body.items[0].distanceKm).toBeGreaterThan(0);
    expect(res.body.radiusKm).toBe(15);
  });

  it('asks for a location when "near me" has none', async () => {
    const res = await api().get('/api/v1/market/search').query({ q: 'plumber near me' });
    expect(res.body.needsLocation).toBe(true);
  });

  it('understands Shona and filters by place and price', async () => {
    const res = await api().get('/api/v1/market/search').query({ q: 'ndiri kutsvaga foni yakachipa pasi pe$100 kuMbare' });
    expect(res.status).toBe(200);
    expect(res.body.items.map((l: { title: string }) => l.title)).toEqual(['Itel A70 phone']);
    expect(res.body.summary).toContain('Mbare');
  });

  it('lets on-screen filters override the phrase, and browses without one', async () => {
    const res = await api().get('/api/v1/market/search').query({ category: 'phones', sort: 'price_asc' });
    expect(res.body.interpretation).toBeNull();
    expect(res.body.items.map((l: { title: string }) => l.title)).toEqual(['Nokia phone', 'Itel A70 phone', 'iPhone 11']);
    const within = await api().get('/api/v1/market/search').query({ category: 'phones', ...HARARE, radiusKm: 20 });
    expect(within.body.items.map((l: { title: string }) => l.title)).not.toContain('Nokia phone');
    expect((await api().get('/api/v1/market/search').query({ category: 'nonsense' })).status).toBe(400);
    expect((await api().get('/api/v1/market/search').query({ lat: 5 })).status).toBe(400);
    expect((await api().get('/api/v1/market/search').query({ q: 'x'.repeat(201) })).status).toBe(400);
  });

  it('uses the AI interpreter when available, sanitises its answer and falls back when it fails', async () => {
    setAiInterpreterForTests(async () => ({
      keywords: ['iphone'],
      category: 'phones',
      kind: 'ITEM',
      minPriceUsd: null,
      maxPriceUsd: 200,
      condition: null,
      auctionsOnly: false,
      swapsOnly: false,
      nearMe: false,
      area: "Mbare'; DROP TABLE listings;--",
      sort: 'relevance',
      language: 'en',
    }));
    const ai = await api().get('/api/v1/market/search').query({ q: 'iphone yakanaka' });
    expect(ai.body.interpretation).toMatchObject({ source: 'ai', category: 'phones', maxPriceCents: 20_000, area: null });
    expect(ai.body.items.map((l: { title: string }) => l.title)).toContain('iPhone 11');

    setAiInterpreterForTests(async () => {
      throw new Error('network down');
    });
    const fallback = await api().get('/api/v1/market/search').query({ q: 'cheapest plumber' });
    expect(fallback.status).toBe(200);
    expect(fallback.body.interpretation.source).toBe('rules');

    setAiInterpreterForTests(async () => null); // refusal / no key
    expect((await api().get('/api/v1/market/search').query({ q: 'mbatya dzevana' })).body.interpretation.source).toBe('rules');
  });
});

describe('direct chat', () => {
  let listingId: string;

  beforeAll(async () => {
    const l = await createListing(seller, {
      kind: 'ITEM', title: 'Hisense fridge', description: 'Double door fridge, works well', category: 'home', condition: 'GOOD', priceCents: 25000, photos: [photoUrl],
    });
    listingId = l.id;
  });

  it('lets buyers and sellers message each other privately', async () => {
    expect((await api().post(`/api/v1/market/listings/${listingId}/messages`).send({ body: 'Hi' })).status).toBe(401);
    expect((await api().post(`/api/v1/market/listings/${listingId}/messages`).set(auth(seller)).send({ body: 'Hi' })).status).toBe(403);
    expect((await api().post(`/api/v1/market/listings/${listingId}/messages`).set(auth(buyer)).send({ body: '   ' })).status).toBe(400);
    expect((await api().post(`/api/v1/market/listings/${listingId}/messages`).set(auth(buyer)).send({ body: 'x'.repeat(1001) })).status).toBe(400);

    const first = await api().post(`/api/v1/market/listings/${listingId}/messages`).set(auth(buyer)).send({ body: 'Is the fridge still available?' });
    expect(first.status).toBe(201);
    const threadId = first.body.threadId as string;
    expect(first.body.message).toMatchObject({ mine: true, body: 'Is the fridge still available?' });

    // A second message from the listing reuses the conversation.
    const again = await api().post(`/api/v1/market/listings/${listingId}/messages`).set(auth(buyer)).send({ body: 'I can collect today.' });
    expect(again.body.threadId).toBe(threadId);

    const sellerThreads = await api().get('/api/v1/market/threads').set(auth(seller));
    const t = sellerThreads.body.find((x: { id: string }) => x.id === threadId);
    expect(t).toMatchObject({ role: 'seller', unread: 2, other: { name: 'Tatenda M.' } });
    expect((await api().get('/api/v1/market/threads/unread').set(auth(seller))).body.unread).toBe(2);

    const opened = await api().get(`/api/v1/market/threads/${threadId}`).set(auth(seller));
    expect(opened.body.messages).toHaveLength(2);
    expect(opened.body.messages[0].mine).toBe(false);
    expect((await api().get('/api/v1/market/threads/unread').set(auth(seller))).body.unread).toBe(0);

    const since = opened.body.messages[1].createdAt as string;
    const reply = await api().post(`/api/v1/market/threads/${threadId}/messages`).set(auth(seller)).send({ body: 'Yes, come by 4pm.' });
    expect(reply.status).toBe(201);
    const newer = await api().get(`/api/v1/market/threads/${threadId}`).query({ after: since }).set(auth(buyer));
    expect(newer.body.messages.map((m: { body: string }) => m.body)).toEqual(['Yes, come by 4pm.']);

    // Nobody else can read or post in it.
    expect((await api().get(`/api/v1/market/threads/${threadId}`).set(auth(third))).status).toBe(404);
    expect((await api().post(`/api/v1/market/threads/${threadId}/messages`).set(auth(third)).send({ body: 'hey' })).status).toBe(404);

    await waitFor(() => prisma.notification.findFirst({ where: { type: 'MARKET_MESSAGE', userId: seller.userId } }));
  });

  it('limits how fast people can send messages', async () => {
    const l = await createListing(seller, {
      kind: 'ITEM', title: 'Gas stove', description: 'Two plate gas stove', category: 'home', condition: 'GOOD', priceCents: 3000, photos: [photoUrl],
    });
    const first = await api().post(`/api/v1/market/listings/${l.id}/messages`).set(auth(third)).send({ body: 'Hello 0' });
    expect(first.status).toBe(201);
    let limited = 0;
    for (let i = 1; i <= 15; i++) {
      const res = await api().post(`/api/v1/market/threads/${first.body.threadId}/messages`).set(auth(third)).send({ body: `Hello ${i}` });
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
    expect(await prisma.listingMessage.count({ where: { senderId: third.userId, createdAt: { gte: new Date(Date.now() - 60_000) } } })).toBe(15);
  });
});

describe('barter trade', () => {
  let wanted: string;
  let buyerTv: string;
  let buyerSpeaker: string;
  let thirdBike: string;

  beforeAll(async () => {
    await setUpSeller(buyer, 'Tatenda Swaps', HARARE);
    wanted = (await createListing(seller, {
      kind: 'ITEM', title: 'HP laptop', description: 'Core i5, 8GB RAM, 256GB SSD', category: 'electronics', condition: 'GOOD', priceCents: 30000, photos: [photoUrl], openToBarter: true,
    })).id;
    buyerTv = (await createListing(buyer, { kind: 'ITEM', title: 'Samsung 32 inch TV', description: 'Smart TV with remote', category: 'electronics', condition: 'GOOD', priceCents: 15000, photos: [buyerPhotoUrl] })).id;
    buyerSpeaker = (await createListing(buyer, { kind: 'ITEM', title: 'JBL speaker', description: 'Bluetooth speaker, loud', category: 'electronics', condition: 'LIKE_NEW', priceCents: 8000, photos: [buyerPhotoUrl] })).id;
    thirdBike = (await createListing(third, { kind: 'ITEM', title: 'Mountain bike', description: '21 speed bike, new tyres', category: 'vehicles', condition: 'GOOD', priceCents: 12000, photos: [photoUrl] })).id;
  });

  it('checks who can offer what', async () => {
    const noSwap = (await createListing(seller, {
      kind: 'ITEM', title: 'Microwave', description: 'Defy 20L microwave', category: 'home', condition: 'GOOD', priceCents: 5000, photos: [photoUrl],
    })).id;
    expect((await api().post(`/api/v1/market/listings/${noSwap}/offers`).set(auth(buyer)).send({ itemIds: [buyerTv] })).status).toBe(409);
    expect((await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(seller)).send({ itemIds: [buyerTv] })).status).toBe(403);
    // Someone else's item, nothing, or too many.
    expect((await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(buyer)).send({ itemIds: [thirdBike] })).status).toBe(400);
    expect((await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(buyer)).send({ itemIds: [] })).status).toBe(400);
    expect((await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(buyer)).send({ itemIds: ['a', 'b', 'c', 'd', 'e', 'f'] })).status).toBe(400);
    expect((await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(buyer)).send({ itemIds: [buyerTv], cashCents: -1 })).status).toBe(400);
  });

  it('runs offer → counter → accept, swapping the items', async () => {
    const offer = await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(buyer)).send({ itemIds: [buyerSpeaker], message: 'Speaker for your laptop?' });
    expect(offer.status).toBe(201);
    expect(offer.body).toMatchObject({ status: 'PENDING', role: 'buyer', madeBy: 'buyer', canWithdraw: true, canRespond: false });
    expect((await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(buyer)).send({ itemIds: [buyerTv] })).status).toBe(409);

    // The buyer can't accept their own offer; a stranger can't see it.
    expect((await api().post(`/api/v1/market/offers/${offer.body.id}/accept`).set(auth(buyer))).status).toBe(403);
    expect((await api().get(`/api/v1/market/offers/${offer.body.id}`).set(auth(third))).status).toBe(404);

    // A third person offers their bike: it gets closed when the laptop goes.
    const thirdOffer = await api().post(`/api/v1/market/listings/${wanted}/offers`).set(auth(third)).send({ itemIds: [thirdBike] });
    expect(thirdOffer.status).toBe(201);

    const buyerItems = await api().get(`/api/v1/market/offers/${offer.body.id}/buyer-items`).set(auth(seller));
    expect(buyerItems.body.map((l: { id: string }) => l.id).sort()).toEqual([buyerTv, buyerSpeaker].sort());

    const counter = await api().post(`/api/v1/market/offers/${offer.body.id}/counter`).set(auth(seller)).send({ itemIds: [buyerTv, buyerSpeaker], cashCents: 2000 });
    expect(counter.status).toBe(201);
    expect(counter.body).toMatchObject({ madeBy: 'seller', status: 'PENDING', cashCents: 2000, parentId: offer.body.id });
    expect((await api().get(`/api/v1/market/offers/${offer.body.id}`).set(auth(buyer))).body.status).toBe('COUNTERED');
    expect((await api().post(`/api/v1/market/offers/${offer.body.id}/accept`).set(auth(seller))).status).toBe(409);
    // The seller can't answer their own counter.
    expect((await api().post(`/api/v1/market/offers/${counter.body.id}/accept`).set(auth(seller))).status).toBe(403);

    const detail = await api().get(`/api/v1/market/offers/${counter.body.id}`).set(auth(buyer));
    expect(detail.body.history.map((h: { id: string }) => h.id)).toEqual([offer.body.id]);
    expect(detail.body.canRespond).toBe(true);

    const accepted = await api().post(`/api/v1/market/offers/${counter.body.id}/accept`).set(auth(buyer));
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(accepted.body.threadId).toBeTruthy();

    const laptop = await prisma.listing.findUniqueOrThrow({ where: { id: wanted } });
    expect(laptop).toMatchObject({ status: 'SOLD', soldToId: buyer.userId });
    for (const id of [buyerTv, buyerSpeaker]) {
      expect(await prisma.listing.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'SOLD', soldToId: seller.userId });
    }
    expect((await prisma.barterOffer.findUniqueOrThrow({ where: { id: thirdOffer.body.id } })).status).toBe('DECLINED');
    await waitFor(() => prisma.notification.findFirst({ where: { userId: third.userId, type: 'MARKET_OFFER', title: 'Swap offer closed' } }));
    await waitFor(() => prisma.notification.findFirst({ where: { userId: seller.userId, type: 'MARKET_OFFER', title: 'Swap offer accepted!' } }));
  });

  it('lets people decline and withdraw', async () => {
    const want = (await createListing(seller, {
      kind: 'ITEM', title: 'Office chair', description: 'Comfortable swivel chair', category: 'home', condition: 'GOOD', priceCents: 4000, photos: [photoUrl], openToBarter: true,
    })).id;
    const bikeOffer = await api().post(`/api/v1/market/listings/${want}/offers`).set(auth(third)).send({ itemIds: [thirdBike], cashCents: 500 });
    expect((await api().post(`/api/v1/market/offers/${bikeOffer.body.id}/withdraw`).set(auth(seller))).status).toBe(403);
    expect((await api().post(`/api/v1/market/offers/${bikeOffer.body.id}/decline`).set(auth(third))).status).toBe(403);
    expect((await api().post(`/api/v1/market/offers/${bikeOffer.body.id}/decline`).set(auth(seller))).body.status).toBe('DECLINED');

    const retry = await api().post(`/api/v1/market/listings/${want}/offers`).set(auth(third)).send({ itemIds: [thirdBike] });
    expect(retry.status).toBe(201);
    expect((await api().post(`/api/v1/market/offers/${retry.body.id}/withdraw`).set(auth(third))).body.status).toBe('WITHDRAWN');
    expect((await api().post(`/api/v1/market/offers/${retry.body.id}/accept`).set(auth(seller))).status).toBe(409);

    // Switching swaps off closes waiting offers.
    const last = await api().post(`/api/v1/market/listings/${want}/offers`).set(auth(third)).send({ itemIds: [thirdBike] });
    await api().patch(`/api/v1/market/listings/${want}`).set(auth(seller)).send({ openToBarter: false }).expect(200);
    expect((await prisma.barterOffer.findUniqueOrThrow({ where: { id: last.body.id } })).status).toBe('DECLINED');

    const mine = await api().get('/api/v1/market/offers').set(auth(third));
    expect(mine.body.length).toBeGreaterThanOrEqual(3);
  });
});

describe('live auctions', () => {
  let auctionId: string;

  beforeAll(async () => {
    auctionId = (await createListing(seller, {
      kind: 'ITEM', title: 'PlayStation 4', description: 'PS4 with two controllers', category: 'electronics', condition: 'GOOD', priceCents: 1000, photos: [photoUrl], saleType: 'AUCTION', auctionEndsAt: inMinutes(30),
    })).id;
  });

  it('enforces the bidding rules and streams new bids', async () => {
    const http = await import('node:http');
    const { io: connect } = await import('socket.io-client');
    const { initSocket } = await import('../src/realtime/socket');
    const { setIo } = await import('../src/realtime/io');
    const server = http.createServer(app);
    const io = initSocket(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const watcher = connect(url, { auth: { token: third.token }, transports: ['websocket'], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => {
        watcher.on('connect', () => resolve());
        watcher.on('connect_error', reject);
      });
      const joined = await new Promise<{ ok: boolean }>((resolve) => watcher.emit('listing:subscribe', { listingId: auctionId }, resolve));
      expect(joined.ok).toBe(true);
      const streamed = new Promise<{ auction: { currentBidCents: number } }>((resolve) => watcher.on('listing:bid', resolve));

      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).send({ amountCents: 1000 })).status).toBe(401);
      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(seller)).send({ amountCents: 1000 })).status).toBe(403);
      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(buyer)).send({ amountCents: 999 })).status).toBe(400);
      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(buyer)).send({ amountCents: 10.5 })).status).toBe(400);

      const first = await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(buyer)).send({ amountCents: 1000 });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ isHighestBidder: true, bid: { bidder: 'You', amountCents: 1000 }, auction: { minNextBidCents: 1050, bidCount: 1 } });
      expect((await streamed).auction.currentBidCents).toBe(1000);
      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(buyer)).send({ amountCents: 1100 })).status).toBe(409);

      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(third)).send({ amountCents: 1049 })).status).toBe(400);
      expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(third)).send({ amountCents: 1050 })).status).toBe(201);
      await waitFor(() => prisma.notification.findFirst({ where: { userId: buyer.userId, type: 'MARKET_OUTBID' } }));

      const state = await api().get(`/api/v1/market/listings/${auctionId}/auction`).set(auth(third));
      expect(state.body).toMatchObject({ isHighestBidder: true, auction: { currentBidCents: 1050, bidCount: 2 } });
      expect(state.body.bids.map((b: { bidder: string }) => b.bidder)).toEqual(['You', 'Tatenda M.']);

      // Price, end time and deleting are locked once there are bids.
      expect((await api().patch(`/api/v1/market/listings/${auctionId}`).set(auth(seller)).send({ priceCents: 5000 })).status).toBe(409);
      expect((await api().delete(`/api/v1/market/listings/${auctionId}`).set(auth(seller))).status).toBe(409);
      expect((await api().post(`/api/v1/market/listings/${auctionId}/sold`).set(auth(seller))).status).toBe(409);
    } finally {
      watcher.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      setIo(null);
    }
  });

  it('extends the auction when someone bids in the last two minutes', async () => {
    await prisma.listing.update({ where: { id: auctionId }, data: { auctionEndsAt: new Date(Date.now() + 30_000) } });
    const late = await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(buyer)).send({ amountCents: 1100 });
    expect(late.status).toBe(201);
    expect(late.body.extended).toBe(true);
    const endsIn = new Date(late.body.auction.endsAt).getTime() - Date.now();
    expect(endsIn).toBeGreaterThan(100_000);
    expect(endsIn).toBeLessThanOrEqual(120_000);
  });

  it('limits bids per minute in the database', async () => {
    const other = (await createListing(seller, {
      kind: 'ITEM', title: 'Xbox controller', description: 'Wireless controller, works', category: 'electronics', condition: 'GOOD', priceCents: 500, photos: [photoUrl], saleType: 'AUCTION', auctionEndsAt: inMinutes(30),
    })).id;
    await prisma.bid.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ listingId: other, bidderId: third.userId, amountCents: 100 + i })) });
    expect((await api().post(`/api/v1/market/listings/${other}/bids`).set(auth(third)).send({ amountCents: 500 })).status).toBe(429);
    await prisma.bid.deleteMany({ where: { listingId: other } });
  });

  it('closes ended auctions: sold to the highest bidder, who gets a chat with the seller', async () => {
    await prisma.listing.update({ where: { id: auctionId }, data: { auctionEndsAt: new Date(Date.now() - 1000) } });
    // Ended auctions leave search straight away.
    const search = await api().get('/api/v1/market/search').query({ saleType: 'AUCTION' });
    expect(search.body.items.map((l: { id: string }) => l.id)).not.toContain(auctionId);

    expect(await closeEndedAuctions()).toBeGreaterThanOrEqual(1);
    expect(await closeEndedAuctions()).toBe(0);
    const sold = await prisma.listing.findUniqueOrThrow({ where: { id: auctionId } });
    expect(sold).toMatchObject({ status: 'SOLD', soldToId: buyer.userId, currentBidCents: 1100 });
    expect(await prisma.listingThread.findUnique({ where: { listingId_buyerId: { listingId: auctionId, buyerId: buyer.userId } } })).not.toBeNull();
    await waitFor(() => prisma.notification.findFirst({ where: { userId: buyer.userId, type: 'MARKET_AUCTION_WON' } }));

    expect((await api().post(`/api/v1/market/listings/${auctionId}/bids`).set(auth(third)).send({ amountCents: 5000 })).status).toBe(409);
    const detail = await api().get(`/api/v1/market/listings/${auctionId}`).set(auth(buyer));
    expect(detail.body.winner).toMatchObject({ isYou: true });
  });

  it('closes a no-bid auction on read and lets the seller restart it', async () => {
    const quiet = (await createListing(seller, {
      kind: 'ITEM', title: 'Old radio', description: 'Vintage radio, works', category: 'electronics', condition: 'FAIR', priceCents: 500, photos: [photoUrl], saleType: 'AUCTION', auctionEndsAt: inMinutes(30),
    })).id;
    await prisma.listing.update({ where: { id: quiet }, data: { auctionEndsAt: new Date(Date.now() - 1000) } });
    const read = await api().get(`/api/v1/market/listings/${quiet}`);
    expect(read.body).toMatchObject({ status: 'ACTIVE', auction: { ended: true, bidCount: 0 } });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: quiet } })).auctionClosedAt).not.toBeNull();

    const restarted = await api().patch(`/api/v1/market/listings/${quiet}`).set(auth(seller)).send({ auctionEndsAt: inMinutes(60) });
    expect(restarted.status).toBe(200);
    expect(restarted.body.auction.ended).toBe(false);
    expect((await api().post(`/api/v1/market/listings/${quiet}/bids`).set(auth(buyer)).send({ amountCents: 500 })).status).toBe(201);
  });
});

describe('smart alerts', () => {
  let farSeller: Session;

  beforeAll(async () => {
    farSeller = await login(PHONES.far, 'CUSTOMER', 'Sipho Dube');
    await setUpSeller(farSeller, 'Bulawayo Deals', BULAWAYO, { area: 'Suburbs', city: 'Bulawayo' });
  });

  it('follows sellers and alerts followers about new listings', async () => {
    const sellerId = (await prisma.sellerProfile.findUniqueOrThrow({ where: { userId: seller.userId } })).id;
    expect((await api().post(`/api/v1/market/sellers/${sellerId}/follow`).set(auth(seller))).status).toBe(400);
    const followed = await api().post(`/api/v1/market/sellers/${sellerId}/follow`).set(auth(third));
    expect(followed.body).toMatchObject({ following: true, followers: 1 });
    expect((await api().get('/api/v1/market/me/following').set(auth(third))).body[0]).toMatchObject({ id: sellerId });

    const l = await createListing(seller, {
      kind: 'ITEM', title: 'Kids bicycle', description: 'For ages 5 to 8', category: 'kids', condition: 'GOOD', priceCents: 3500, photos: [photoUrl],
    });
    const alert = await waitFor(() =>
      prisma.notification.findFirst({ where: { userId: third.userId, type: 'MARKET_ALERT', data: { path: ['listingId'], equals: l.id } } }),
    );
    expect(alert.title).toBe("New from Chipo's Corner");
    const alerts = await api().get('/api/v1/market/me/alerts').set(auth(third));
    expect(alerts.body[0].listing).toMatchObject({ id: l.id });

    expect((await api().delete(`/api/v1/market/sellers/${sellerId}/follow`).set(auth(third))).body.following).toBe(false);
  });

  it('alerts saved searches when a matching item is posted nearby, not far away', async () => {
    expect((await api().post('/api/v1/market/me/saved-searches').set(auth(buyer)).send({})).status).toBe(400);
    const saved = await api().post('/api/v1/market/me/saved-searches').set(auth(buyer)).send({ query: 'sofa under $300', ...HARARE, radiusKm: 15 });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ query: 'sofa under $300', hasLocation: true, radiusKm: 15 });
    expect(saved.body.summary).toContain('under US$300');

    const far = await createListing(farSeller, {
      kind: 'ITEM', title: 'Three seater sofa', description: 'Grey fabric sofa, clean', category: 'home', condition: 'GOOD', priceCents: 20000, photos: [photoUrl],
    });
    const tooDear = await createListing(seller, {
      kind: 'ITEM', title: 'Leather sofa set', description: 'Five seater leather sofa', category: 'home', condition: 'LIKE_NEW', priceCents: 90000, photos: [photoUrl],
    });
    const near = await createListing(seller, {
      kind: 'ITEM', title: 'Two seater sofa', description: 'Brown sofa, good condition', category: 'home', condition: 'GOOD', priceCents: 15000, photos: [photoUrl],
    });
    await drainBackgroundTasks();
    expect(await prisma.notification.count({ where: { userId: buyer.userId, type: 'MARKET_ALERT', data: { path: ['listingId'], equals: near.id } } })).toBe(1);
    for (const id of [far.id, tooDear.id]) {
      expect(await prisma.notification.count({ where: { userId: buyer.userId, type: 'MARKET_ALERT', data: { path: ['listingId'], equals: id } } })).toBe(0);
    }

    const list = await api().get('/api/v1/market/me/saved-searches').set(auth(buyer));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].lastNotifiedAt).not.toBeNull();
    expect((await api().delete(`/api/v1/market/me/saved-searches/${saved.body.id}`).set(auth(third))).status).toBe(404);
    expect((await api().delete(`/api/v1/market/me/saved-searches/${saved.body.id}`).set(auth(buyer))).status).toBe(200);
  });
});

describe('admin moderation', () => {
  it('lets admins list and remove listings, and nobody else', async () => {
    expect((await api().get('/api/v1/market/admin/listings').set(auth(buyer))).status).toBe(403);
    const list = await api().get('/api/v1/market/admin/listings').set(auth(admin)).query({ status: 'ACTIVE' });
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThan(0);
    const target = list.body.items[0].id as string;
    expect((await api().delete(`/api/v1/market/admin/listings/${target}`).set(auth(admin)).send({})).status).toBe(400);
    expect((await api().delete(`/api/v1/market/admin/listings/${target}`).set(auth(admin)).send({ reason: 'Counterfeit goods' })).status).toBe(200);
    expect((await api().get(`/api/v1/market/listings/${target}`)).status).toBe(404);
  });
});
