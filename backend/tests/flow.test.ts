import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { updateSettings } from '../src/modules/settings/settings.service';
import { api, app, auth, login, PHONES, resetDb, seedWorld, waitFor, type Session } from './helpers';

let world: Awaited<ReturnType<typeof seedWorld>>;
let customer: Session;
let vendor: Session;
let rider: Session;
let admin: Session;
let addressId: string;

beforeAll(async () => {
  await resetDb();
  world = await seedWorld();
  customer = await login(PHONES.customer, 'CUSTOMER', 'Tatenda');
  vendor = await login(PHONES.vendor, 'VENDOR');
  rider = await login(PHONES.rider, 'RIDER');
  admin = await login(PHONES.admin, 'ADMIN');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('auth', () => {
  it('rejects self-assigned admin and wrong codes', async () => {
    const otp = await api().post('/api/v1/auth/otp/request').send({ phone: '0779999999' });
    expect(otp.status).toBe(200);
    expect(otp.body.devCode).toMatch(/^\d{6}$/);
    const denied = await api().post('/api/v1/auth/otp/verify').send({ phone: '0779999999', code: otp.body.devCode, role: 'ADMIN' });
    expect(denied.status).toBe(403);

    const again = await api().post('/api/v1/auth/otp/request').send({ phone: '+263779999999' });
    expect(again.status).toBe(429); // 30s resend cooldown

    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });
    const fresh = await api().post('/api/v1/auth/otp/request').send({ phone: '0779999999' });
    const wrong = await api().post('/api/v1/auth/otp/verify').send({ phone: '0779999999', code: '000000' === fresh.body.devCode ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/Incorrect code/);
  });

  it('validates phone numbers', async () => {
    const res = await api().post('/api/v1/auth/otp/request').send({ phone: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const session = await login('+263775555555', 'CUSTOMER');
    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(session.refreshToken);

    const reuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(reuse.status).toBe(401);
    // Reuse revokes the whole family, including the newest token.
    const afterReuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('supports password login for dashboards', async () => {
    const ok = await api().post('/api/v1/auth/login').send({ phone: '0772000101', password: 'Vendor12345', role: 'VENDOR' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.roles).toContain('VENDOR');
    const bad = await api().post('/api/v1/auth/login').send({ phone: '0772000101', password: 'nope' });
    expect(bad.status).toBe(401);
    const wrongRole = await api().post('/api/v1/auth/login').send({ phone: '0772000101', password: 'Vendor12345', role: 'ADMIN' });
    expect(wrongRole.status).toBe(403);
  });

  it('enforces roles', async () => {
    const res = await api().get('/api/v1/admin/dashboard').set(auth(customer));
    expect(res.status).toBe(403);
    const anon = await api().get('/api/v1/admin/dashboard');
    expect(anon.status).toBe(401);
  });
});

describe('browsing', () => {
  it('lists vendors with distance, fee and open status', async () => {
    const res = await api().get('/api/v1/vendors').query({ lat: -17.7925, lng: 31.0487, category: 'food', openNow: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const v = res.body.items[0];
    expect(v).toMatchObject({ name: 'Sadza Republic', isOpen: true, deliverable: true });
    expect(v.deliveryFeeCents).toBeGreaterThan(0);
    const menu = await api().get(`/api/v1/vendors/${v.slug}`).query({ lat: -17.7925, lng: 31.0487 });
    expect(menu.status).toBe(200);
    expect(menu.body.sections[0].products.map((p: { name: string }) => p.name)).toContain('Sadza & Beef');
    const search = await api().get('/api/v1/vendors').query({ q: 'oxtail' });
    expect(search.body.total).toBe(1);
  });
});

describe('vendor onboarding & menu', () => {
  it('onboards a new vendor pending approval, then admin approves', async () => {
    const newVendor = await login('+263772000199', 'VENDOR', 'Chipo');
    const res = await api()
      .post('/api/v1/vendor/onboarding')
      .set(auth(newVendor))
      .send({
        name: 'Chipo’s Bakery',
        phone: '0772000199',
        categorySlug: 'food',
        lat: -17.8,
        lng: 31.04,
        addressLine: '1 Baker St, Avondale',
        landmark: 'Yellow wall',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.slug).toBe('chipo-s-bakery');
    const hidden = await api().get('/api/v1/vendors').query({ q: 'bakery' });
    expect(hidden.body.total).toBe(0);

    const section = await api().post('/api/v1/vendor/sections').set(auth(newVendor)).send({ name: 'Breads' });
    expect(section.status).toBe(201);
    const product = await api()
      .post('/api/v1/vendor/products')
      .set(auth(newVendor))
      .send({ name: 'Sourdough', priceCents: 400, sectionId: section.body.id, trackStock: true, stockQty: 5 });
    expect(product.status).toBe(201);
    const stock = await api().post(`/api/v1/vendor/products/${product.body.id}/stock`).set(auth(newVendor)).send({ delta: -2 });
    expect(stock.body.stockQty).toBe(3);

    const approve = await api().patch(`/api/v1/admin/vendors/${res.body.id}`).set(auth(admin)).send({ status: 'APPROVED' });
    expect(approve.status).toBe(200);
    const visible = await api().get('/api/v1/vendors').query({ q: 'bakery' });
    expect(visible.body.total).toBe(1);
  });

  it('updates opening hours with validation', async () => {
    const bad = await api()
      .put('/api/v1/vendor/me/hours')
      .set(auth(vendor))
      .send({ hours: [{ dayOfWeek: 1, opensAt: '25:00', closesAt: '10:00' }] });
    expect(bad.status).toBe(400);
    const ok = await api()
      .put('/api/v1/vendor/me/hours')
      .set(auth(vendor))
      .send({ hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '00:00' })) });
    expect(ok.status).toBe(200);
    expect(ok.body.isOpen).toBe(true);
  });
});

describe('cash order: order → accept → auto-dispatch → deliver → wallet', () => {
  let orderId: string;
  let totalCents: number;
  let riderEarning: number;

  it('saves an address with landmark', async () => {
    const res = await api()
      .post('/api/v1/customer/addresses')
      .set(auth(customer))
      .send({ label: 'Home', lat: -17.7925, lng: 31.0487, street: '7 Lanark Rd', suburb: 'Belgravia', landmark: 'Blue gate opposite Spar' });
    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(true);
    addressId = res.body.id;
  });

  it('quotes and places a cash order, reserving stock', async () => {
    const items = [
      { productId: world.sadza.id, quantity: 2 },
      { productId: world.oxtail.id, quantity: 1 },
    ];
    const quote = await api().post('/api/v1/orders/quote').set(auth(customer)).send({ vendorId: world.vendor.id, items, addressId, tipCents: 100, currency: 'ZWG' });
    expect(quote.status).toBe(200);
    expect(quote.body.subtotalCents).toBe(2 * 550 + 850);
    expect(quote.body.totalLocalCents).toBe(Math.round(quote.body.totalCents * quote.body.exchangeRate));

    const tooMany = await api()
      .post('/api/v1/orders/quote')
      .set(auth(customer))
      .send({ vendorId: world.vendor.id, items: [{ productId: world.oxtail.id, quantity: 4 }], addressId, tipCents: 0 });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.message).toMatch(/Only 3/);

    const res = await api()
      .post('/api/v1/orders')
      .set(auth(customer))
      .send({ vendorId: world.vendor.id, items, addressId, tipCents: 100, paymentMethod: 'CASH', notes: 'Extra muriwo please' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PLACED');
    expect(res.body.order.deliveryPin).toMatch(/^\d{4}$/);
    orderId = res.body.order.id;
    totalCents = res.body.order.amounts.totalCents;
    const oxtail = await prisma.product.findUniqueOrThrow({ where: { id: world.oxtail.id } });
    expect(oxtail.stockQty).toBe(2);
  });

  it('hides the PIN from the vendor and lets the vendor accept', async () => {
    const list = await api().get('/api/v1/vendor/orders').query({ status: 'active' }).set(auth(vendor));
    expect(list.status).toBe(200);
    const o = list.body.items.find((x: { id: string }) => x.id === orderId);
    expect(o.deliveryPin).toBeUndefined();
    expect(o.customer.phone).toBeUndefined();
    expect(o.amounts.commissionCents).toBeGreaterThan(0);

    // Rider goes online near the store so auto-dispatch can find them.
    const online = await api().post('/api/v1/rider/status').set(auth(rider)).send({ online: true, lat: -17.83, lng: 31.046 });
    expect(online.status).toBe(200);

    const accept = await api().post(`/api/v1/vendor/orders/${orderId}/accept`).set(auth(vendor)).send({ prepMinutes: 15 });
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('ACCEPTED');
  });

  it('offers the order to the nearest rider, who accepts', async () => {
    const offer = await waitFor(() => prisma.dispatchOffer.findFirst({ where: { orderId, status: 'OFFERED' } }));
    expect(offer.riderId).toBe(world.rider.id);
    const current = await api().get('/api/v1/rider/offers/current').set(auth(rider));
    expect(current.body.offer.order.cashToCollectCents).toBe(totalCents);

    const accepted = await api().post(`/api/v1/rider/offers/${offer.id}/accept`).set(auth(rider));
    expect(accepted.status).toBe(200);
    expect(accepted.body.customer.phone).toBe(PHONES.customer);
    riderEarning = accepted.body.amounts.riderEarningCents;

    const cantOffline = await api().post('/api/v1/rider/status').set(auth(rider)).send({ online: false });
    expect(cantOffline.status).toBe(409);
  });

  it('tracks the rider and supports chat', async () => {
    const loc = await api().post('/api/v1/rider/location').set(auth(rider)).send({ lat: -17.831, lng: 31.0457, heading: 90 });
    expect(loc.status).toBe(200);
    const tracking = await api().get(`/api/v1/orders/${orderId}/tracking`).set(auth(customer));
    expect(tracking.status).toBe(200);
    expect(tracking.body.rider.location.lat).toBeCloseTo(-17.831);
    expect(tracking.body.etaMinutes).toBeGreaterThan(0);

    const msg = await api().post(`/api/v1/orders/${orderId}/messages`).set(auth(customer)).send({ body: 'Blue gate please!' });
    expect(msg.status).toBe(201);
    const msgs = await api().get(`/api/v1/orders/${orderId}/messages`).set(auth(rider));
    expect(msgs.body[0]).toMatchObject({ body: 'Blue gate please!', mine: false });

    const outsider = await login('+263776666666', 'CUSTOMER');
    const denied = await api().get(`/api/v1/orders/${orderId}`).set(auth(outsider));
    expect(denied.status).toBe(404);
  });

  it('moves through pickup and delivery with PIN proof', async () => {
    const early = await api().post(`/api/v1/rider/orders/${orderId}/deliver`).set(auth(rider)).send({ proofType: 'PIN', pin: '0000' });
    expect(early.status).toBe(409);

    await api().post(`/api/v1/vendor/orders/${orderId}/ready`).set(auth(vendor)).expect(200);
    await api().post(`/api/v1/rider/orders/${orderId}/picked-up`).set(auth(rider)).expect(200);
    await api().post(`/api/v1/rider/orders/${orderId}/on-the-way`).set(auth(rider)).expect(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const wrongPin = order.deliveryPin === '0000' ? '1111' : '0000';
    const wrong = await api().post(`/api/v1/rider/orders/${orderId}/deliver`).set(auth(rider)).send({ proofType: 'PIN', pin: wrongPin });
    expect(wrong.status).toBe(400);

    const done = await api().post(`/api/v1/rider/orders/${orderId}/deliver`).set(auth(rider)).send({ proofType: 'PIN', pin: order.deliveryPin });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('DELIVERED');
    expect(done.body.paymentStatus).toBe('PAID');
  });

  it('credits fee + tip and records cash owed', async () => {
    const wallet = await api().get('/api/v1/rider/wallet').set(auth(rider));
    expect(wallet.status).toBe(200);
    const expectedBalance = riderEarning + 100 - totalCents;
    expect(wallet.body.balanceCents).toBe(expectedBalance);
    expect(wallet.body.cashOwedCents).toBe(-expectedBalance);
    expect(wallet.body.outstandingCashCents).toBe(-expectedBalance);

    const tx = await api().get('/api/v1/rider/wallet/transactions').set(auth(rider));
    expect(tx.body.items.map((t: { type: string }) => t.type).sort()).toEqual(['CASH_COLLECTED', 'DELIVERY_FEE', 'TIP']);

    const collection = await prisma.cashCollection.findUniqueOrThrow({ where: { orderId } });
    expect(collection.amountCents).toBe(totalCents);
    expect(collection.settledCents).toBe(riderEarning + 100); // netted against earnings
  });

  it('lets the customer rate, reorder and report a problem', async () => {
    const rate = await api().post(`/api/v1/orders/${orderId}/rate`).set(auth(customer)).send({ vendorScore: 5, vendorComment: 'Lekker!', riderScore: 4 });
    expect(rate.status).toBe(200);
    const vendorRow = await prisma.vendor.findUniqueOrThrow({ where: { id: world.vendor.id } });
    expect(vendorRow.ratingAvg).toBe(5);

    const reorder = await api().post(`/api/v1/orders/${orderId}/reorder`).set(auth(customer));
    expect(reorder.body.items).toHaveLength(2);

    const dispute = await api().post(`/api/v1/orders/${orderId}/dispute`).set(auth(customer)).send({ reason: 'MISSING_ITEMS', description: 'No muriwo' });
    expect(dispute.status).toBe(201);
    const resolved = await api()
      .post(`/api/v1/admin/disputes/${dispute.body.id}/resolve`)
      .set(auth(admin))
      .send({ status: 'RESOLVED', resolution: 'Partial refund issued', refundCents: 200, refundMethod: 'ECOCASH', refundReference: 'EC123' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.refunds[0]).toMatchObject({ amountCents: 200, status: 'COMPLETED' });
  });

  it('records cash remittance and settles collections', async () => {
    const owed = (await api().get('/api/v1/rider/wallet').set(auth(rider))).body.cashOwedCents;
    const tooMuch = await api().post(`/api/v1/admin/riders/${world.rider.id}/cash-remittance`).set(auth(admin)).send({ amountCents: owed + 1, reference: 'R1' });
    expect(tooMuch.status).toBe(400);
    const res = await api().post(`/api/v1/admin/riders/${world.rider.id}/cash-remittance`).set(auth(admin)).send({ amountCents: owed, reference: 'R1' });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(0);
    expect(res.body.cashOwedCents).toBe(0);
    const collection = await prisma.cashCollection.findUniqueOrThrow({ where: { orderId } });
    expect(collection.status).toBe('SETTLED');
  });
});

describe('cash limit enforcement', () => {
  it('blocks riders at their cash limit from cash orders', async () => {
    await updateSettings({ defaultCashLimitCents: 500 }, world.admin.id);
    const res = await api()
      .post('/api/v1/orders')
      .set(auth(customer))
      .send({ vendorId: world.vendor.id, items: [{ productId: world.sadza.id, quantity: 2 }], addressId, tipCents: 0, paymentMethod: 'CASH' });
    expect(res.status).toBe(201);
    const orderId = res.body.order.id;
    await api().post(`/api/v1/vendor/orders/${orderId}/accept`).set(auth(vendor)).send({ prepMinutes: 10 }).expect(200);

    // Auto-dispatch must skip the rider (order total > limit).
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.dispatchOffer.count({ where: { orderId, status: 'OFFERED' } })).toBe(0);

    const manual = await api().post(`/api/v1/admin/orders/${orderId}/assign`).set(auth(admin)).send({ riderId: world.rider.id });
    expect(manual.status).toBe(409);
    expect(manual.body.error.message).toMatch(/Cash limit/);

    await updateSettings({ defaultCashLimitCents: 5000 }, world.admin.id);
    const ok = await api().post(`/api/v1/admin/orders/${orderId}/assign`).set(auth(admin)).send({ riderId: world.rider.id });
    expect(ok.status).toBe(200);
    expect(ok.body.rider.id).toBe(world.rider.id);

    const release = await api().post(`/api/v1/rider/orders/${orderId}/decline`).set(auth(rider)).send({ reason: 'Flat tyre' });
    expect(release.status).toBe(200);
    const cancel = await api().post(`/api/v1/admin/orders/${orderId}/cancel`).set(auth(admin)).send({ reason: 'Test cleanup' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');
    // Declined recently → not re-offered; cancelled → offers withdrawn.
    expect(await prisma.dispatchOffer.count({ where: { orderId, status: 'OFFERED' } })).toBe(0);
  });
});

describe('online payment (mock Paynow) and parcels', () => {
  it('confirms an EcoCash payment and places the order', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .set(auth(customer))
      .send({ vendorId: world.vendor.id, items: [{ productId: world.sadza.id, quantity: 1 }], addressId, tipCents: 0, paymentMethod: 'ECOCASH', currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PENDING_PAYMENT');
    expect(res.body.payment.status).toBe('PENDING');
    expect(res.body.paymentError).toBeNull();

    // Simulate time passing so the mock provider confirms.
    await prisma.payment.update({ where: { id: res.body.payment.id }, data: { createdAt: new Date(Date.now() - 10_000) } });
    const status = await api().get(`/api/v1/payments/${res.body.payment.id}`).set(auth(customer));
    expect(status.body.status).toBe('PAID');
    const order = await api().get(`/api/v1/orders/${res.body.order.id}`).set(auth(customer));
    expect(order.body.status).toBe('PLACED');
    expect(order.body.paymentStatus).toBe('PAID');

    // Vendor rejects → automatic refund is queued.
    await api().post(`/api/v1/vendor/orders/${res.body.order.id}/reject`).set(auth(vendor)).send({ reason: 'Out of gas' }).expect(200);
    const refund = await prisma.refund.findFirst({ where: { orderId: res.body.order.id } });
    expect(refund).toMatchObject({ status: 'PENDING', amountCents: res.body.order.amounts.totalCents });
  });

  it('rejects forged Paynow callbacks', async () => {
    const res = await api()
      .post('/api/v1/payments/paynow/result')
      .type('form')
      .send('reference=DSP-FAKE&status=Paid&hash=ABC');
    expect(res.status).toBe(400);
  });

  it('quotes and books a parcel delivery', async () => {
    const body = {
      pickup: { lat: -17.83, lng: 31.05, address: 'Kopje Plaza', landmark: 'Reception desk' },
      recipientName: 'Mai Chipo',
      recipientPhone: '0774123456',
      description: 'Documents envelope',
      size: 'SMALL',
      addressId,
      tipCents: 0,
    };
    const quote = await api().post('/api/v1/orders/parcel/quote').set(auth(customer)).send(body);
    expect(quote.status).toBe(200);
    expect(quote.body.subtotalCents).toBe(0);
    const res = await api().post('/api/v1/orders/parcel').set(auth(customer)).send({ ...body, paymentMethod: 'CASH' });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ type: 'PARCEL', status: 'PLACED' });
    expect(res.body.order.dropoff.recipientPhone).toBe('+263774123456');
  });

  it('rejects addresses outside service zones', async () => {
    const res = await api()
      .post('/api/v1/orders/quote')
      .set(auth(customer))
      .send({ vendorId: world.vendor.id, items: [{ productId: world.sadza.id, quantity: 1 }], dropoff: { lat: -20.15, lng: 28.58, landmark: 'Bulawayo' }, tipCents: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/outside our delivery zones/);
  });
});

describe('payouts, reports and analytics', () => {
  it('handles a rider payout request, rejection reversal and weekly limit', async () => {
    await prisma.$transaction(async (tx) => {
      const { postWalletEntry } = await import('../src/modules/wallet/wallet.service');
      await postWalletEntry(tx, world.rider.id, { type: 'BONUS', amountCents: 1500, description: 'Test bonus' });
    });
    const noDetails = await api().post('/api/v1/rider/payouts').set(auth(rider)).send({ amountCents: 1000 });
    expect(noDetails.status).toBe(400);
    await api().patch('/api/v1/rider/me').set(auth(rider)).send({ payoutMethod: 'ECOCASH', payoutAccount: '0773000201' }).expect(200);
    const payout = await api().post('/api/v1/rider/payouts').set(auth(rider)).send({ amountCents: 1000 });
    expect(payout.status).toBe(201);
    expect((await api().get('/api/v1/rider/wallet').set(auth(rider))).body.balanceCents).toBe(500);

    const second = await api().post('/api/v1/rider/payouts').set(auth(rider)).send({ amountCents: 500 });
    expect(second.status).toBe(409);

    const rejected = await api().post(`/api/v1/admin/payouts/${payout.body.id}/process`).set(auth(admin)).send({ status: 'REJECTED', notes: 'Wrong number' });
    expect(rejected.status).toBe(200);
    expect((await api().get('/api/v1/rider/wallet').set(auth(rider))).body.balanceCents).toBe(1500);
  });

  it('generates vendor reports, statements and payouts', async () => {
    const sales = await api().get('/api/v1/vendor/reports/sales').set(auth(vendor));
    expect(sales.status).toBe(200);
    expect(sales.body.totals.orders).toBe(1);
    const statement = await api().get('/api/v1/vendor/reports/statement').set(auth(vendor));
    expect(statement.body.summary.netCents).toBe(statement.body.summary.grossCents - statement.body.summary.commissionCents);

    await prisma.vendor.update({ where: { id: world.vendor.id }, data: { payoutMethod: 'ECOCASH', payoutAccount: '0772000101' } });
    const gen = await api().post('/api/v1/admin/payouts/vendors/generate').set(auth(admin));
    expect(gen.status).toBe(200);
    expect(gen.body.created).toBe(1);
    const history = await api().get('/api/v1/vendor/payouts').set(auth(vendor));
    expect(history.body.items[0].amountCents).toBe(statement.body.summary.netCents);
    expect(history.body.balance.balanceCents).toBe(0);
  });

  it('serves admin analytics and live map data', async () => {
    const dash = await api().get('/api/v1/admin/dashboard').set(auth(admin));
    expect(dash.status).toBe(200);
    expect(dash.body.deliveredToday).toBe(1);
    const stats = await api().get('/api/v1/admin/analytics').set(auth(admin));
    expect(stats.status).toBe(200);
    expect(stats.body.totals.delivered).toBe(1);
    expect(stats.body.riderPerformance[0].deliveries).toBe(1);
    const live = await api().get('/api/v1/admin/live').set(auth(admin));
    expect(live.status).toBe(200);
    expect(Array.isArray(live.body.riders)).toBe(true);
  });

  it('documents the API', async () => {
    const res = await api().get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/api/v1/orders'].post).toBeDefined();
    expect(res.body.paths['/api/v1/orders/{id}/tracking'].get).toBeDefined();
  });
});

describe('uploads', () => {
  it('stores public images and protects private documents', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#FF7A00' } }).png().toBuffer();

    const denied = await api().post('/api/v1/uploads').query({ kind: 'product' }).set(auth(customer)).attach('file', png, 'x.png');
    expect(denied.status).toBe(403);

    const pub = await api().post('/api/v1/uploads').query({ kind: 'product' }).set(auth(vendor)).attach('file', png, 'dish.png');
    expect(pub.status).toBe(201);
    expect(pub.body.isPrivate).toBe(false);
    const publicPath = new URL(pub.body.thumbUrl).pathname;
    const served = await api().get(publicPath);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/webp');

    const doc = await api().post('/api/v1/uploads').query({ kind: 'document' }).set(auth(rider)).attach('file', png, 'id.png');
    expect(doc.status).toBe(201);
    expect(doc.body.isPrivate).toBe(true);
    const privatePath = new URL(doc.body.url).pathname;
    expect((await api().get(privatePath).set(auth(rider))).status).toBe(200);
    expect((await api().get(privatePath).set(auth(admin))).status).toBe(200);
    expect((await api().get(privatePath).set(auth(customer))).status).toBe(403);
    expect((await api().get(privatePath)).status).toBe(401);
    expect((await api().get('/api/v1/uploads/private/../../etc/passwd').set(auth(admin))).status).toBe(404);

    const notImage = await api().post('/api/v1/uploads').query({ kind: 'document' }).set(auth(rider)).attach('file', Buffer.from('hello'), { filename: 'a.png', contentType: 'image/png' });
    expect(notImage.status).toBe(400);
  });
});

describe('real-time (Socket.IO)', () => {
  it('authenticates sockets, guards order rooms and streams rider location with ETA', async () => {
    const http = await import('node:http');
    const { io: connect } = await import('socket.io-client');
    const { initSocket } = await import('../src/realtime/socket');
    const { setIo } = await import('../src/realtime/io');

    const server = http.createServer(app);
    const io = initSocket(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}`;

    try {
      // Rejects bad tokens
      const bad = connect(url, { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
      const badError = await new Promise<Error>((resolve) => bad.on('connect_error', resolve));
      expect(badError.message).toBe('unauthorized');
      bad.close();

      // The rider may still hold an offer from an earlier test (e.g. the parcel) — decline it first.
      const pending = await api().get('/api/v1/rider/offers/current').set(auth(rider));
      if (pending.body.offer) {
        await api().post(`/api/v1/rider/offers/${pending.body.offer.offerId}/decline`).set(auth(rider)).expect(200);
      }
      await prisma.dispatchOffer.updateMany({ where: { riderId: world.rider.id, status: 'OFFERED' }, data: { status: 'EXPIRED' } });

      // Active cash order with the rider assigned
      const placed = await api()
        .post('/api/v1/orders')
        .set(auth(customer))
        .send({ vendorId: world.vendor.id, items: [{ productId: world.sadza.id, quantity: 1 }], addressId, tipCents: 0, paymentMethod: 'CASH' });
      expect(placed.status).toBe(201);
      const orderId = placed.body.order.id as string;
      await api().post('/api/v1/rider/status').set(auth(rider)).send({ online: true, lat: -17.83, lng: 31.046 }).expect(200);

      const customerSocket = connect(url, { auth: { token: customer.token }, transports: ['websocket'], reconnection: false });
      await new Promise<void>((resolve, reject) => {
        customerSocket.on('connect', () => resolve());
        customerSocket.on('connect_error', reject);
      });
      const statusUpdate = new Promise<{ id: string; status: string }>((resolve) =>
        customerSocket.on('order:updated', (o: { id: string; status: string }) => o.id === orderId && o.status === 'ACCEPTED' && resolve(o)),
      );

      await api().post(`/api/v1/vendor/orders/${orderId}/accept`).set(auth(vendor)).send({ prepMinutes: 10 }).expect(200);
      expect((await statusUpdate).status).toBe('ACCEPTED');

      const offer = await waitFor(() => prisma.dispatchOffer.findFirst({ where: { orderId, status: 'OFFERED' } }));
      await api().post(`/api/v1/rider/offers/${offer.id}/accept`).set(auth(rider)).expect(200);

      const ack = await customerSocket.timeout(3000).emitWithAck('order:subscribe', { orderId });
      expect(ack).toEqual({ ok: true });

      const outsider = await login('+263777777777', 'CUSTOMER');
      const outsiderSocket = connect(url, { auth: { token: outsider.token }, transports: ['websocket'], reconnection: false });
      await new Promise<void>((resolve) => outsiderSocket.on('connect', () => resolve()));
      expect(await outsiderSocket.timeout(3000).emitWithAck('order:subscribe', { orderId })).toEqual({ ok: false, error: 'Order not found' });

      const location = new Promise<{ orderId: string; lat: number; etaMinutes: number }>((resolve) =>
        customerSocket.on('order:rider_location', resolve),
      );
      // Rider streams location over the socket.
      const riderSocket = connect(url, { auth: { token: rider.token }, transports: ['websocket'], reconnection: false });
      await new Promise<void>((resolve) => riderSocket.on('connect', () => resolve()));
      expect(await riderSocket.timeout(3000).emitWithAck('rider:location', { lat: -17.8305, lng: 31.0458, heading: 45 })).toEqual({ ok: true });
      const payload = await location;
      expect(payload.orderId).toBe(orderId);
      expect(payload.lat).toBeCloseTo(-17.8305);
      expect(payload.etaMinutes).toBeGreaterThan(0);

      // Customers can't spoof rider locations.
      expect(await customerSocket.timeout(3000).emitWithAck('rider:location', { lat: 0, lng: 0 })).toEqual({ ok: false, error: 'Not an approved rider' });

      customerSocket.close();
      outsiderSocket.close();
      riderSocket.close();
      await api().post(`/api/v1/admin/orders/${orderId}/cancel`).set(auth(admin)).send({ reason: 'socket test cleanup' }).expect(200);
    } finally {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      setIo(null);
    }
  });
});
