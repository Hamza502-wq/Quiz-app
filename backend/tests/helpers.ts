import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RoleName } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { clearSettingsCache } from '../src/modules/settings/settings.service';

export const app = createApp();
export const api = () => request(app);

/** Empties every table in the test database (never point tests at real data). */
export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('test')) throw new Error(`Refusing to truncate a non-test database: ${url}`);
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  clearSettingsCache();
}

export interface Session {
  token: string;
  refreshToken: string;
  userId: string;
}

export async function login(phone: string, role: RoleName = 'CUSTOMER', name?: string): Promise<Session> {
  const otp = await api().post('/api/v1/auth/otp/request').send({ phone });
  if (otp.status !== 200) throw new Error(`OTP request failed: ${JSON.stringify(otp.body)}`);
  const res = await api()
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: otp.body.devCode, role, name });
  if (res.status !== 200) throw new Error(`OTP verify failed: ${JSON.stringify(res.body)}`);
  // Age codes past the 30s resend cooldown so later logins in the same run work.
  await prisma.otpCode.updateMany({ where: {}, data: { createdAt: new Date(Date.now() - 60_000) } });
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, userId: res.body.user.id };
}

export const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

export async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for condition');
}

export const PHONES = {
  admin: '+263770000001',
  vendor: '+263772000101',
  rider: '+263773000201',
  rider2: '+263773000202',
  customer: '+263774000301',
};

/** Minimal world: categories, a Harare zone, an admin, an approved open vendor, an approved rider. */
export async function seedWorld() {
  for (const name of ['CUSTOMER', 'RIDER', 'VENDOR', 'ADMIN'] as RoleName[]) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }
  const food = await prisma.category.create({ data: { name: 'Food', slug: 'food', sortOrder: 1 } });
  await prisma.category.create({ data: { name: 'Parcels', slug: 'parcels', sortOrder: 4 } });
  const zone = await prisma.zone.create({
    data: { name: 'Harare Metro', city: 'Harare', centerLat: -17.8292, centerLng: 31.0522, radiusKm: 22 },
  });

  const roleId = async (name: RoleName) => (await prisma.role.findUniqueOrThrow({ where: { name } })).id;
  const admin = await prisma.user.create({
    data: {
      phone: PHONES.admin,
      name: 'Admin',
      passwordHash: await bcrypt.hash('Admin12345', 4),
      roles: { create: { roleId: await roleId('ADMIN') } },
    },
  });
  const owner = await prisma.user.create({
    data: {
      phone: PHONES.vendor,
      name: 'Rudo',
      passwordHash: await bcrypt.hash('Vendor12345', 4),
      roles: { create: { roleId: await roleId('VENDOR') } },
    },
  });
  const vendor = await prisma.vendor.create({
    data: {
      userId: owner.id,
      categoryId: food.id,
      zoneId: zone.id,
      name: 'Sadza Republic',
      slug: 'sadza-republic',
      phone: PHONES.vendor,
      lat: -17.8312,
      lng: 31.0456,
      addressLine: '45 Samora Machel Ave',
      status: 'APPROVED',
      // Open 24 hours every day so tests don't depend on the clock.
      openingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '00:00' })) },
    },
  });
  const sadza = await prisma.product.create({
    data: { vendorId: vendor.id, name: 'Sadza & Beef', priceCents: 550 },
  });
  const oxtail = await prisma.product.create({
    data: { vendorId: vendor.id, name: 'Oxtail', priceCents: 850, trackStock: true, stockQty: 3 },
  });

  const riderUser = await prisma.user.create({
    data: { phone: PHONES.rider, name: 'Tawanda', roles: { create: { roleId: await roleId('RIDER') } } },
  });
  const rider = await prisma.rider.create({
    data: {
      userId: riderUser.id,
      status: 'APPROVED',
      nationalId: '63-1234567A12',
      idDocumentUrl: 'https://example.com/id.png',
      licenceNumber: 'LIC1',
      licenceDocumentUrl: 'https://example.com/lic.png',
      vehiclePlate: 'AEF 1234',
      wallet: { create: {} },
    },
  });
  return { admin, owner, vendor, sadza, oxtail, rider, riderUser, zone };
}
