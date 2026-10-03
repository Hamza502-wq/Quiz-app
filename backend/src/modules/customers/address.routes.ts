import { Router } from 'express';
import { z } from 'zod';
import { defineRoute, idParams, latLng } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/errors';
import { optionalTrimmed, trimmed } from '../../lib/validation';

export const addressRouter = Router();
const basePath = '/api/v1/customer/addresses';
const tags = ['Customer'];

const addressBody = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  ...latLng,
  street: optionalTrimmed(120),
  suburb: optionalTrimmed(80),
  city: z.string().trim().min(2).max(60).default('Harare'),
  landmark: trimmed(200).describe('Directions a rider can follow, e.g. "blue gate opposite Spar"'),
  makeDefault: z.boolean().optional(),
});

async function customerId(userId: string) {
  const c = await prisma.customer.findUnique({ where: { userId }, select: { id: true } });
  if (!c) throw forbidden('Customer profile not found');
  return c.id;
}

function present(a: { id: string; label: string; lat: number; lng: number; street: string | null; suburb: string | null; city: string; landmark: string }, defaultId: string | null) {
  return { id: a.id, label: a.label, lat: a.lat, lng: a.lng, street: a.street, suburb: a.suburb, city: a.city, landmark: a.landmark, isDefault: a.id === defaultId };
}

defineRoute(addressRouter, {
  method: 'get',
  path: '/',
  basePath,
  tags,
  summary: 'My saved delivery addresses',
  auth: 'required',
  roles: ['CUSTOMER'],
  handler: async ({ user }) => {
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw forbidden('Customer profile not found');
    const addresses = await prisma.address.findMany({
      where: { customerId: customer.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
    return addresses.map((a) => present(a, customer.defaultAddressId));
  },
});

defineRoute(addressRouter, {
  method: 'post',
  path: '/',
  basePath,
  tags,
  summary: 'Save an address (map pin + landmark description)',
  auth: 'required',
  roles: ['CUSTOMER'],
  body: addressBody,
  status: 201,
  handler: async ({ body, user }) => {
    const cid = await customerId(user.id);
    const { makeDefault, ...data } = body;
    const count = await prisma.address.count({ where: { customerId: cid, isDeleted: false } });
    const address = await prisma.address.create({ data: { ...data, customerId: cid } });
    const isDefault = makeDefault || count === 0;
    if (isDefault) await prisma.customer.update({ where: { id: cid }, data: { defaultAddressId: address.id } });
    return present(address, isDefault ? address.id : null);
  },
});

defineRoute(addressRouter, {
  method: 'patch',
  path: '/:id',
  basePath,
  tags,
  summary: 'Update a saved address',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  body: addressBody.partial(),
  handler: async ({ body, params, user }) => {
    const cid = await customerId(user.id);
    const existing = await prisma.address.findFirst({ where: { id: params.id, customerId: cid, isDeleted: false } });
    if (!existing) throw notFound('Address');
    const { makeDefault, ...data } = body;
    const address = await prisma.address.update({ where: { id: existing.id }, data });
    if (makeDefault) await prisma.customer.update({ where: { id: cid }, data: { defaultAddressId: address.id } });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: cid } });
    return present(address, customer.defaultAddressId);
  },
});

defineRoute(addressRouter, {
  method: 'delete',
  path: '/:id',
  basePath,
  tags,
  summary: 'Delete a saved address',
  auth: 'required',
  roles: ['CUSTOMER'],
  params: idParams,
  handler: async ({ params, user }) => {
    const cid = await customerId(user.id);
    const res = await prisma.address.updateMany({ where: { id: params.id, customerId: cid }, data: { isDeleted: true } });
    if (res.count === 0) throw notFound('Address');
    await prisma.customer.updateMany({ where: { id: cid, defaultAddressId: params.id }, data: { defaultAddressId: null } });
    return { ok: true };
  },
});
