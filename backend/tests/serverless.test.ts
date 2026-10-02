import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { errorHandler } from '../src/middleware/errorHandler';
import { env } from '../src/config/env';
import api from '../netlify/functions/api';
import jobs from '../netlify/functions/jobs';
import { resetDb } from './helpers';

const BASE = 'https://doorstep.example';
const call = (path: string, init?: RequestInit) => api(new Request(`${BASE}${path}`, init), { ip: '203.0.113.9' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (res: Response): Promise<any> => res.json();
const json = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

let previousStorage: typeof env.UPLOAD_STORAGE;
let previousTrustProxy: number;

beforeAll(async () => {
  await resetDb();
  previousStorage = env.UPLOAD_STORAGE;
  previousTrustProxy = env.TRUST_PROXY;
  // As configured on Netlify (the app is created on the first request).
  env.UPLOAD_STORAGE = 'database';
  env.TRUST_PROXY = 1;
});

afterAll(async () => {
  // The functions apply Netlify defaults to process.env; don't leak them into other test files.
  for (const key of ['UPLOAD_STORAGE', 'TRUST_PROXY', 'SECRETS_FROM_DATABASE_URL']) delete process.env[key];
  env.UPLOAD_STORAGE = previousStorage;
  env.TRUST_PROXY = previousTrustProxy;
  await prisma.$disconnect();
});

describe('Netlify Functions entry point', () => {
  it('serves health, meta and JSON errors', async () => {
    const health = await call('/health');
    expect(health.status).toBe(200);
    expect(await read(health)).toMatchObject({ status: 'ok' });

    const meta = await call('/api/v1/meta');
    expect(await read(meta)).toEqual({ paymentsSimulated: true, smsSignIn: true });

    const missing = await call('/api/v1/nope');
    expect(missing.status).toBe(404);
    expect((await read(missing)).error.code).toBe('NOT_FOUND');

    const query = await call('/api/v1/vendors?page=1&pageSize=5&search=pizza%20place');
    expect(query.status).toBe(200);
  });

  it('signs up, signs in and sends background notifications before returning', async () => {
    const created = await call('/api/v1/auth/register', json({ phone: '0778222333', password: 'Shop12345', name: 'Chipo', role: 'VENDOR' }));
    expect(created.status).toBe(200);
    const session = await read(created);
    expect(session.user.roles).toEqual(['VENDOR']);

    const spoofed = json({ phone: '+263778222333', password: 'Shop12345', role: 'VENDOR' });
    spoofed.headers = { ...(spoofed.headers as Record<string, string>), 'x-forwarded-for': '198.51.100.1' };
    const login = await call('/api/v1/auth/login', spoofed);
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = await read(login);
    // The visitor address comes from the platform, never from a client-supplied header.
    const { sha256 } = await import('../src/lib/random');
    const token = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(refreshToken) } });
    expect(token.ip).toBe('203.0.113.9');

    const me = await call('/api/v1/auth/me', { headers: { authorization: `Bearer ${accessToken}` } });
    expect((await read(me)).phone).toBe('+263778222333');

    // A vendor application notifies admins in the background; it must be stored by the time the response is back.
    const admin = await prisma.user.create({ data: { phone: '+263770000099', name: 'Admin' } });
    const role = await prisma.role.upsert({ where: { name: 'ADMIN' }, create: { name: 'ADMIN' }, update: {} });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    await prisma.category.create({ data: { name: 'Food', slug: 'food' } });
    const apply = await call(
      '/api/v1/vendor/onboarding',
      json(
        {
          name: 'Chipo’s Kitchen',
          categorySlug: 'food',
          phone: '0778222333',
          addressLine: '12 Samora Machel Ave, Harare',
          lat: -17.829,
          lng: 31.052,
          logoUrl: 'https://doorstep.example/uploads/public/vendor/logo.webp',
        },
        accessToken,
      ),
    );
    expect(apply.status).toBe(201);
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBe(1);
  });

  it('round-trips binary uploads through the database', async () => {
    const login = await call('/api/v1/auth/login', json({ phone: '0778222333', password: 'Shop12345' }));
    const { accessToken } = await read(login);
    const png = await sharp({ create: { width: 50, height: 40, channels: 3, background: '#FF7A00' } }).png().toBuffer();

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'logo.png');
    const uploaded = await call('/api/v1/uploads?kind=vendor', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: form,
    });
    expect(uploaded.status).toBe(201);
    const { url } = await read(uploaded);

    const image = await call(new URL(url).pathname);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/webp');
    const bytes = Buffer.from(await image.arrayBuffer());
    const stored = await prisma.storedFile.findUniqueOrThrow({ where: { path: new URL(url).pathname.replace('/uploads/', '') } });
    expect(bytes.equals(Buffer.from(stored.data))).toBe(true);
    expect((await sharp(bytes).metadata()).format).toBe('webp');
  });

  it('runs the scheduled jobs', async () => {
    const res = await jobs();
    expect(res.status).toBe(204);
  });

  it('explains a missing DATABASE_URL instead of crashing', async () => {
    const databaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      for (const path of ['/api/v1/auth/register', '/health']) {
        const res = await call(path, json({ phone: '0778222444', password: 'Rider1234', name: 'Tino', role: 'RIDER' }));
        expect(res.status).toBe(503);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect((await read(res)).error).toMatchObject({ code: 'NOT_CONFIGURED', message: expect.stringContaining('DATABASE_URL') });
      }
      expect((await jobs()).status).toBe(204);
    } finally {
      process.env.DATABASE_URL = databaseUrl;
    }
    expect(await prisma.user.count({ where: { phone: '+263778222444' } })).toBe(0);
  });
});

describe('error handler', () => {
  it('answers 503 when the database cannot be reached', () => {
    let status = 0;
    let body: unknown;
    const res = {
      headersSent: false,
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as ExpressResponse;
    const err = new Prisma.PrismaClientInitializationError("Can't reach database server", Prisma.prismaVersion.client, 'P1001');
    errorHandler(err, { path: '/api/v1/auth/register', method: 'POST' } as ExpressRequest, res, () => undefined);
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
  });
});
