/**
 * Seed data for local development and testing.
 *
 *   npm run db:seed
 *
 * Creates roles, categories, zones (Harare, Bulawayo), an admin, sample vendors
 * with menus, riders (approved and pending), customers with addresses, a bonus
 * rule and two weeks of order history so dashboards have data.
 *
 * Every seeded account can log in with OTP (enable OTP_DEV_ECHO to see the code).
 * Vendor and admin accounts also get the password in SEED_ADMIN_PASSWORD.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type PaymentMethod, type RoleName } from '@prisma/client';
import { postWalletEntry } from '../src/modules/wallet/wallet.service';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'DoorStep@2026';
const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE || '+263770000001';

async function role(name: RoleName) {
  return prisma.role.upsert({ where: { name }, create: { name }, update: {} });
}

async function user(phone: string, name: string, roles: RoleName[], withPassword = false) {
  const passwordHash = withPassword ? await bcrypt.hash(PASSWORD, 12) : undefined;
  const u = await prisma.user.upsert({
    where: { phone },
    create: { phone, name, passwordHash },
    update: { name, ...(passwordHash ? { passwordHash } : {}) },
  });
  for (const r of roles) {
    const roleRow = await role(r);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: roleRow.id } },
      create: { userId: u.id, roleId: roleRow.id },
      update: {},
    });
  }
  return u;
}

const allWeek = (opensAt: string, closesAt: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt }));

interface SeedVendor {
  ownerPhone: string;
  ownerName: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  addressLine: string;
  landmark: string;
  city: string;
  zone: string;
  avgPrepMinutes: number;
  minOrderCents: number;
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
  menu: Array<{ section: string; items: Array<[name: string, priceCents: number, description: string, stock?: number]> }>;
}

const VENDORS: SeedVendor[] = [
  {
    ownerPhone: '+263772000101',
    ownerName: 'Rudo Moyo',
    name: 'Sadza Republic',
    slug: 'sadza-republic',
    category: 'food',
    description: 'Traditional Zimbabwean plates — sadza, nyama, muriwo and more.',
    lat: -17.8312,
    lng: 31.0456,
    addressLine: '45 Samora Machel Ave, Harare CBD',
    landmark: 'Next to the green pharmacy, opposite the bus stop',
    city: 'Harare',
    zone: 'Harare Metro',
    avgPrepMinutes: 20,
    minOrderCents: 300,
    hours: allWeek('07:00', '22:00'),
    menu: [
      {
        section: 'Sadza plates',
        items: [
          ['Sadza & Beef Stew', 550, 'Hand-stirred sadza with slow-cooked beef and muriwo.'],
          ['Sadza & Road-runner Chicken', 650, 'Free-range chicken stew, sadza and covo.'],
          ['Sadza & Matemba', 450, 'Crispy kapenta with tomato relish.'],
          ['Sadza & Oxtail', 850, 'Rich oxtail stew — weekend favourite.', 25],
        ],
      },
      {
        section: 'Sides & drinks',
        items: [
          ['Muriwo une Dovi', 200, 'Greens in peanut butter sauce.'],
          ['Maheu (500ml)', 150, 'Traditional fermented maize drink.'],
          ['Mazoe Orange (2L)', 350, 'The classic Zimbabwean cordial.'],
        ],
      },
    ],
  },
  {
    ownerPhone: '+263772000102',
    ownerName: 'Tendai Chikwanha',
    name: 'Borrowdale Pizza Co.',
    slug: 'borrowdale-pizza-co',
    category: 'food',
    description: 'Wood-fired pizzas, burgers and shakes.',
    lat: -17.7584,
    lng: 31.0886,
    addressLine: 'Borrowdale Village, Harare',
    landmark: 'Upstairs, blue door beside the bank',
    city: 'Harare',
    zone: 'Harare Metro',
    avgPrepMinutes: 25,
    minOrderCents: 500,
    hours: allWeek('10:00', '23:00'),
    menu: [
      {
        section: 'Pizzas',
        items: [
          ['Margherita (Large)', 900, 'Tomato, mozzarella and basil.'],
          ['Peri-Peri Chicken (Large)', 1200, 'Grilled chicken, peppers and peri-peri drizzle.'],
          ['Boerewors & Onion (Large)', 1150, 'A local twist on a classic.'],
        ],
      },
      {
        section: 'Burgers',
        items: [
          ['Classic Beef Burger', 750, '180g patty, cheese, tomato and chips.'],
          ['Chicken Burger', 700, 'Crumbed chicken breast with slaw and chips.'],
        ],
      },
      {
        section: 'Drinks',
        items: [
          ['Chocolate Shake', 400, 'Thick and creamy.'],
          ['Coca-Cola (500ml)', 150, 'Ice cold.'],
        ],
      },
    ],
  },
  {
    ownerPhone: '+263772000103',
    ownerName: 'Farai Ncube',
    name: 'FreshMart Groceries',
    slug: 'freshmart-groceries',
    category: 'groceries',
    description: 'Fresh produce, pantry staples and household essentials.',
    lat: -17.8052,
    lng: 31.0395,
    addressLine: '12 Second Street Extension, Avondale',
    landmark: 'Behind Avondale shops, white gate with yellow sign',
    city: 'Harare',
    zone: 'Harare Metro',
    avgPrepMinutes: 15,
    minOrderCents: 1000,
    hours: allWeek('07:30', '20:00'),
    menu: [
      {
        section: 'Staples',
        items: [
          ['Roller Meal (10kg)', 850, 'Super-refined white maize meal.', 60],
          ['Rice (2kg)', 350, 'Long-grain white rice.', 80],
          ['Cooking Oil (2L)', 450, 'Sunflower oil.', 50],
          ['Sugar (2kg)', 300, 'Brown sugar.', 70],
        ],
      },
      {
        section: 'Fresh produce',
        items: [
          ['Tomatoes (1kg)', 150, 'Locally grown.', 40],
          ['Onions (1kg)', 120, 'Brown onions.', 40],
          ['Covo / Rape bundle', 50, 'Freshly harvested greens.', 100],
          ['Bananas (1kg)', 180, 'Sweet and ripe.', 30],
        ],
      },
      {
        section: 'Dairy & bakery',
        items: [
          ['Fresh Milk (2L)', 250, 'Full cream.', 45],
          ['Bread (loaf)', 120, 'Baked this morning.', 60],
          ['Eggs (tray of 30)', 550, 'Farm fresh.', 25],
        ],
      },
    ],
  },
  {
    ownerPhone: '+263772000104',
    ownerName: 'Nyasha Mutasa',
    name: 'Greenleaf Pharmacy',
    slug: 'greenleaf-pharmacy',
    category: 'pharmacy',
    description: 'Over-the-counter medicines, vitamins and personal care.',
    lat: -17.7755,
    lng: 31.0521,
    addressLine: 'Mount Pleasant Shopping Centre',
    landmark: 'Green cross sign, next to the post office',
    city: 'Harare',
    zone: 'Harare Metro',
    avgPrepMinutes: 10,
    minOrderCents: 0,
    hours: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: '08:00', closesAt: '19:00' })).concat([
      { dayOfWeek: 6, opensAt: '08:00', closesAt: '14:00' },
    ]),
    menu: [
      {
        section: 'Pain & fever',
        items: [
          ['Paracetamol 500mg (20)', 150, 'Pain and fever relief.', 100],
          ['Ibuprofen 200mg (24)', 250, 'Anti-inflammatory pain relief.', 80],
        ],
      },
      {
        section: 'Cold & flu',
        items: [
          ['Cough Syrup (100ml)', 450, 'Soothing cough relief.', 30],
          ['Vitamin C 1000mg (30)', 600, 'Immune support.', 40],
        ],
      },
      {
        section: 'Personal care',
        items: [
          ['Hand Sanitiser (500ml)', 300, '70% alcohol.', 50],
          ['Sunscreen SPF50', 900, 'Broad spectrum protection.', 20],
        ],
      },
    ],
  },
  {
    ownerPhone: '+263772000105',
    ownerName: 'Sipho Dube',
    name: 'Bulawayo Braai House',
    slug: 'bulawayo-braai-house',
    category: 'food',
    description: 'Flame-grilled meats and sides from the City of Kings.',
    lat: -20.1497,
    lng: 28.5832,
    addressLine: '88 Jason Moyo Street, Bulawayo',
    landmark: 'Corner with 9th Avenue, red awning',
    city: 'Bulawayo',
    zone: 'Bulawayo',
    avgPrepMinutes: 30,
    minOrderCents: 400,
    hours: allWeek('11:00', '02:00'),
    menu: [
      {
        section: 'From the grill',
        items: [
          ['Boerewors Roll', 400, 'Grilled boerewors in a fresh roll.'],
          ['T-Bone & Pap', 1100, '300g T-bone, pap and chakalaka.'],
          ['Braai Platter for Two', 2200, 'Wors, chops, chicken, pap and salads.'],
        ],
      },
    ],
  },
];

const RIDERS = [
  { phone: '+263773000201', name: 'Tawanda Sibanda', plate: 'AEF 1234', lat: -17.826, lng: 31.05, status: 'APPROVED' as const },
  { phone: '+263773000202', name: 'Kudzai Maposa', plate: 'ADK 5521', lat: -17.8, lng: 31.045, status: 'APPROVED' as const },
  { phone: '+263773000203', name: 'Blessing Zulu', plate: 'AFH 9087', lat: -17.77, lng: 31.08, status: 'APPROVED' as const },
  { phone: '+263773000204', name: 'Themba Ndlovu', plate: 'ABZ 3310', lat: -20.15, lng: 28.585, status: 'APPROVED' as const },
  { phone: '+263773000205', name: 'Chipo Marufu', plate: 'AGG 7002', lat: -17.83, lng: 31.03, status: 'PENDING' as const },
];

const CUSTOMERS = [
  {
    phone: '+263774000301',
    name: 'Tatenda Mhlanga',
    addresses: [
      { label: 'Home', lat: -17.7925, lng: 31.0487, street: '7 Lanark Road', suburb: 'Belgravia', landmark: 'Blue gate opposite Spar, ring twice' },
      { label: 'Work', lat: -17.8293, lng: 31.0522, street: 'Kopje Plaza, Jason Moyo Ave', suburb: 'CBD', landmark: '3rd floor reception, ask for Tatenda' },
    ],
  },
  {
    phone: '+263774000302',
    name: 'Anesu Chigumba',
    addresses: [
      { label: 'Home', lat: -17.7641, lng: 31.0712, street: '22 Hindhead Ave', suburb: 'Borrowdale', landmark: 'Cream wall with jacaranda tree, black gate' },
    ],
  },
];

async function main() {
  console.log('🌱 Seeding DoorStep Zimbabwe…');
  for (const r of ['CUSTOMER', 'RIDER', 'VENDOR', 'ADMIN'] as RoleName[]) await role(r);

  const categories = [
    { name: 'Food', slug: 'food', icon: 'restaurant', sortOrder: 1 },
    { name: 'Groceries', slug: 'groceries', icon: 'local_grocery_store', sortOrder: 2 },
    { name: 'Pharmacy', slug: 'pharmacy', icon: 'local_pharmacy', sortOrder: 3 },
    { name: 'Parcels', slug: 'parcels', icon: 'inventory_2', sortOrder: 4 },
    // Any kind of shop can sell on DoorStep, not only food.
    { name: 'Electronics & phones', slug: 'electronics', icon: 'devices', sortOrder: 5 },
    { name: 'Clothing & shoes', slug: 'fashion', icon: 'checkroom', sortOrder: 6 },
    { name: 'Beauty & personal care', slug: 'beauty', icon: 'spa', sortOrder: 7 },
    { name: 'Hardware & tools', slug: 'hardware', icon: 'hardware', sortOrder: 8 },
    { name: 'Home & kitchen', slug: 'home', icon: 'chair', sortOrder: 9 },
    { name: 'Books & stationery', slug: 'books', icon: 'menu_book', sortOrder: 10 },
    { name: 'Flowers & gifts', slug: 'gifts', icon: 'local_florist', sortOrder: 11 },
    { name: 'Farm & garden', slug: 'farm', icon: 'yard', sortOrder: 12 },
    { name: 'Other shops', slug: 'other', icon: 'storefront', sortOrder: 13 },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: c });
  }

  const zoneSpecs = [
    { name: 'Harare Metro', city: 'Harare', centerLat: -17.8292, centerLng: 31.0522, radiusKm: 22 },
    { name: 'Bulawayo', city: 'Bulawayo', centerLat: -20.1325, centerLng: 28.6265, radiusKm: 18 },
  ];
  const zones: Record<string, string> = {};
  for (const z of zoneSpecs) {
    const existing = await prisma.zone.findFirst({ where: { name: z.name } });
    const zone = existing ? await prisma.zone.update({ where: { id: existing.id }, data: z }) : await prisma.zone.create({ data: z });
    zones[z.name] = zone.id;
  }

  await prisma.setting.upsert({ where: { key: 'zigPerUsd' }, create: { key: 'zigPerUsd', value: 26.8 }, update: {} });

  await user(ADMIN_PHONE, 'DoorStep Admin', ['ADMIN'], true);

  const vendorIds: string[] = [];
  const productsByVendor: Record<string, Array<{ id: string; name: string; priceCents: number }>> = {};
  for (const v of VENDORS) {
    const owner = await user(v.ownerPhone, v.ownerName, ['VENDOR'], true);
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: v.category } });
    const data = {
      name: v.name,
      description: v.description,
      phone: v.ownerPhone,
      lat: v.lat,
      lng: v.lng,
      addressLine: v.addressLine,
      landmark: v.landmark,
      city: v.city,
      avgPrepMinutes: v.avgPrepMinutes,
      minOrderCents: v.minOrderCents,
      status: 'APPROVED' as const,
      categoryId: category.id,
      zoneId: zones[v.zone],
      payoutMethod: 'ECOCASH' as const,
      payoutAccount: `0${v.ownerPhone.slice(4)}`,
      payoutAccountName: v.ownerName,
    };
    const vendor = await prisma.vendor.upsert({
      where: { slug: v.slug },
      create: { ...data, slug: v.slug, userId: owner.id },
      update: data,
    });
    vendorIds.push(vendor.id);

    await prisma.vendorOpeningHour.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.vendorOpeningHour.createMany({ data: v.hours.map((h) => ({ ...h, vendorId: vendor.id })) });

    const hasProducts = await prisma.product.count({ where: { vendorId: vendor.id } });
    if (!hasProducts) {
      let sectionOrder = 0;
      for (const s of v.menu) {
        const section = await prisma.menuSection.create({ data: { vendorId: vendor.id, name: s.section, sortOrder: sectionOrder++ } });
        let itemOrder = 0;
        for (const [name, priceCents, description, stock] of s.items) {
          await prisma.product.create({
            data: {
              vendorId: vendor.id,
              sectionId: section.id,
              name,
              priceCents,
              description,
              sortOrder: itemOrder++,
              trackStock: stock !== undefined,
              stockQty: stock ?? 0,
            },
          });
        }
      }
    }
    productsByVendor[vendor.id] = await prisma.product.findMany({
      where: { vendorId: vendor.id, isDeleted: false },
      select: { id: true, name: true, priceCents: true },
    });
  }

  const riderIds: string[] = [];
  for (const [i, r] of RIDERS.entries()) {
    const u = await user(r.phone, r.name, ['RIDER']);
    const data = {
      status: r.status,
      nationalId: `63-${1234560 + i}A${10 + i}`,
      idDocumentUrl: 'https://placehold.co/800x500/png?text=National+ID',
      licenceNumber: `LIC${40000 + i}`,
      licenceDocumentUrl: 'https://placehold.co/800x500/png?text=Licence',
      licenceExpiry: new Date('2029-12-31'),
      vehicleType: 'MOTORBIKE' as const,
      vehicleMake: 'Honda',
      vehicleModel: 'Ace 125',
      vehiclePlate: r.plate,
      vehicleColor: ['Red', 'Black', 'Blue', 'White', 'Silver'][i],
      lat: r.lat,
      lng: r.lng,
      locationUpdatedAt: new Date(),
      zoneId: r.lat < -19 ? zones.Bulawayo : zones['Harare Metro'],
      approvedAt: r.status === 'APPROVED' ? new Date() : null,
      payoutMethod: 'ECOCASH' as const,
      payoutAccount: `0${r.phone.slice(4)}`,
      payoutAccountName: r.name,
    };
    const rider = await prisma.rider.upsert({ where: { userId: u.id }, create: { ...data, userId: u.id }, update: data });
    await prisma.riderWallet.upsert({ where: { riderId: rider.id }, create: { riderId: rider.id }, update: {} });
    if (r.status === 'APPROVED') riderIds.push(rider.id);
  }

  const customerRecords: Array<{ id: string; userId: string; name: string; phone: string; addresses: Array<{ id: string; lat: number; lng: number; landmark: string; street: string | null; suburb: string | null; city: string }> }> = [];
  for (const c of CUSTOMERS) {
    const u = await user(c.phone, c.name, ['CUSTOMER']);
    const customer = await prisma.customer.upsert({ where: { userId: u.id }, create: { userId: u.id }, update: {} });
    let addresses = await prisma.address.findMany({ where: { customerId: customer.id, isDeleted: false } });
    if (addresses.length === 0) {
      for (const a of c.addresses) await prisma.address.create({ data: { ...a, customerId: customer.id } });
      addresses = await prisma.address.findMany({ where: { customerId: customer.id } });
      await prisma.customer.update({ where: { id: customer.id }, data: { defaultAddressId: addresses[0].id } });
    }
    customerRecords.push({ id: customer.id, userId: u.id, name: c.name, phone: c.phone, addresses });
  }

  const bonusExists = await prisma.bonusRule.count();
  if (!bonusExists) {
    await prisma.bonusRule.createMany({
      data: [
        { name: 'Daily hustle: 10 deliveries', deliveriesTarget: 10, period: 'DAILY', amountCents: 300 },
        { name: 'Weekly star: 50 deliveries', deliveriesTarget: 50, period: 'WEEKLY', amountCents: 2000 },
      ],
    });
  }

  // ── Order history (only on an empty orders table) ──
  const existingOrders = await prisma.order.count();
  if (existingOrders === 0) {
    const harareVendors = vendorIds.slice(0, 4);
    const harareRiders = riderIds.slice(0, 3);
    const methods: PaymentMethod[] = ['ECOCASH', 'CASH', 'ONEMONEY', 'CARD', 'CASH', 'ECOCASH'];
    let seq = 0;
    for (let daysAgo = 13; daysAgo >= 1; daysAgo--) {
      const perDay = 2 + (daysAgo % 3);
      for (let k = 0; k < perDay; k++) {
        seq++;
        const vendorId = harareVendors[seq % harareVendors.length];
        const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
        const products = productsByVendor[vendorId];
        const picks = [products[seq % products.length], products[(seq + 2) % products.length]];
        const lines = picks.map((p, idx) => ({ ...p, quantity: 1 + ((seq + idx) % 2) }));
        const subtotal = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
        const customer = customerRecords[seq % customerRecords.length];
        const addr = customer.addresses[0];
        const distanceKm = 2 + (seq % 7) * 0.8;
        const deliveryFee = Math.max(200, Math.round(150 + 50 * distanceKm));
        const riderPay = Math.round(100 + 40 * distanceKm);
        const tip = seq % 4 === 0 ? 100 : 0;
        const commission = Math.round((subtotal * 1500) / 10_000);
        const total = subtotal + deliveryFee + tip;
        const method = methods[seq % methods.length];
        const riderId = harareRiders[seq % harareRiders.length];
        const placedAt = new Date(Date.now() - daysAgo * 86_400_000 - k * 3_600_000 - 5 * 3_600_000);
        const minutes = (m: number) => new Date(placedAt.getTime() + m * 60_000);
        const cancelled = seq % 11 === 0;

        const order = await prisma.order.create({
          data: {
            code: `DS-SEED${String(seq).padStart(2, '0')}`,
            type: 'DELIVERY',
            status: cancelled ? 'CANCELLED' : 'DELIVERED',
            customerId: customer.id,
            vendorId,
            riderId: cancelled ? null : riderId,
            zoneId: zones['Harare Metro'],
            pickupLat: vendor.lat,
            pickupLng: vendor.lng,
            pickupAddress: vendor.addressLine,
            pickupLandmark: vendor.landmark,
            pickupContactName: vendor.name,
            pickupContactPhone: vendor.phone,
            dropoffLat: addr.lat,
            dropoffLng: addr.lng,
            dropoffAddress: [addr.street, addr.suburb, addr.city].filter(Boolean).join(', '),
            dropoffLandmark: addr.landmark,
            recipientName: customer.name,
            recipientPhone: customer.phone,
            distanceKm,
            subtotalCents: subtotal,
            deliveryFeeCents: deliveryFee,
            tipCents: tip,
            totalCents: total,
            commissionRateBps: 1500,
            commissionCents: commission,
            vendorEarningCents: subtotal - commission,
            riderEarningCents: riderPay,
            currency: 'USD',
            exchangeRate: 26.8,
            paymentMethod: method,
            paymentStatus: cancelled ? 'CANCELLED' : 'PAID',
            deliveryPin: String(1000 + seq),
            proofType: cancelled ? null : 'PIN',
            prepMinutes: vendor.avgPrepMinutes,
            placedAt,
            acceptedAt: minutes(2),
            assignedAt: cancelled ? null : minutes(4),
            readyAt: cancelled ? null : minutes(vendor.avgPrepMinutes),
            pickedUpAt: cancelled ? null : minutes(vendor.avgPrepMinutes + 3),
            onTheWayAt: cancelled ? null : minutes(vendor.avgPrepMinutes + 4),
            deliveredAt: cancelled ? null : minutes(vendor.avgPrepMinutes + 18),
            cancelledAt: cancelled ? minutes(5) : null,
            cancelReason: cancelled ? 'Customer changed their mind' : null,
            createdAt: placedAt,
            items: {
              create: lines.map((l) => ({
                productId: l.id,
                name: l.name,
                unitPriceCents: l.priceCents,
                quantity: l.quantity,
                lineTotalCents: l.priceCents * l.quantity,
              })),
            },
            payments: {
              create: {
                method,
                status: cancelled ? 'CANCELLED' : 'PAID',
                currency: 'USD',
                amountCents: total,
                amountUsdCents: total,
                reference: `SEED-${seq}`,
                paidAt: cancelled ? null : minutes(1),
                createdAt: placedAt,
              },
            },
            events: {
              create: [
                { type: 'STATUS_CHANGED', status: 'PLACED', message: 'Order placed', createdAt: placedAt },
                ...(cancelled
                  ? [{ type: 'STATUS_CHANGED', status: 'CANCELLED' as const, message: 'Cancelled', createdAt: minutes(5) }]
                  : [{ type: 'STATUS_CHANGED', status: 'DELIVERED' as const, message: 'Delivered — PIN confirmed', createdAt: minutes(vendor.avgPrepMinutes + 18) }]),
              ],
            },
          },
        });

        if (!cancelled) {
          await prisma.$transaction(async (tx) => {
            await postWalletEntry(tx, riderId, { type: 'DELIVERY_FEE', amountCents: riderPay, description: `Delivery ${order.code}`, orderId: order.id });
            if (tip) await postWalletEntry(tx, riderId, { type: 'TIP', amountCents: tip, description: `Tip on ${order.code}`, orderId: order.id });
            if (method === 'CASH') {
              await tx.cashCollection.create({ data: { riderId, orderId: order.id, amountCents: total, createdAt: minutes(vendor.avgPrepMinutes + 18) } });
              await postWalletEntry(tx, riderId, { type: 'CASH_COLLECTED', amountCents: -total, description: `Cash collected for ${order.code}`, orderId: order.id });
            }
          });
          if (seq % 2 === 0) {
            const score = 4 + (seq % 2);
            await prisma.rating.create({
              data: { orderId: order.id, raterId: customer.userId, target: 'VENDOR', vendorId, score, comment: seq % 4 === 0 ? 'Hot and tasty, well packed!' : null },
            });
            await prisma.rating.create({
              data: { orderId: order.id, raterId: customer.userId, target: 'RIDER', riderId, score: 5, comment: seq % 6 === 0 ? 'Friendly and fast.' : null },
            });
          }
        }
      }
    }

    // Riders hand in cash regularly: settle historical cash so every rider starts under their cash limit.
    for (const riderId of harareRiders) {
      const wallet = await prisma.riderWallet.findUniqueOrThrow({ where: { riderId } });
      if (wallet.balanceCents < 0) {
        await prisma.$transaction((tx) =>
          postWalletEntry(tx, riderId, {
            type: 'CASH_REMITTED',
            amountCents: -wallet.balanceCents,
            description: 'Cash remitted at DoorStep office (seed)',
          }),
        );
      }
    }

    for (const vendorId of vendorIds) {
      const agg = await prisma.rating.aggregate({ where: { vendorId, target: 'VENDOR' }, _avg: { score: true }, _count: true });
      await prisma.vendor.update({ where: { id: vendorId }, data: { ratingAvg: agg._avg.score ?? 0, ratingCount: agg._count } });
    }
    for (const riderId of riderIds) {
      const agg = await prisma.rating.aggregate({ where: { riderId, target: 'RIDER' }, _avg: { score: true }, _count: true });
      await prisma.rider.update({ where: { id: riderId }, data: { ratingAvg: agg._avg.score ?? 0, ratingCount: agg._count } });
    }
  }

  console.log('✅ Seed complete.');
  console.log(`   Admin:    ${ADMIN_PHONE} (password: ${PASSWORD})`);
  console.log(`   Vendors:  ${VENDORS.map((v) => v.ownerPhone).join(', ')} (password: ${PASSWORD})`);
  console.log(`   Riders:   ${RIDERS.map((r) => `${r.phone}${r.status === 'PENDING' ? ' (pending)' : ''}`).join(', ')}`);
  console.log(`   Customers:${CUSTOMERS.map((c) => ` ${c.phone}`).join(',')}`);
  console.log('   All accounts can log in with OTP — set OTP_DEV_ECHO=true to receive the code in the API response.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
