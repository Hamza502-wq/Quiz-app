import bcrypt from 'bcryptjs';
import type { RoleName } from '@prisma/client';
import { env } from '../../config/env';
import { prisma, type Db } from '../../lib/prisma';
import { badRequest, forbidden, unauthorized } from '../../lib/errors';
import { generateRefreshToken, signAccessToken } from '../../lib/tokens';
import { sha256 } from '../../lib/random';

const BCRYPT_COST = 12;
// Pre-computed hash used to keep password-login timing constant for unknown users.
const DUMMY_HASH = bcrypt.hashSync('doorstep-timing-guard', 10);

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export async function ensureRole(db: Db, userId: string, role: RoleName): Promise<void> {
  const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId: roleRow.id } },
    create: { userId, roleId: roleRow.id },
    update: {},
  });
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      customer: { select: { id: true, defaultAddressId: true } },
      rider: { select: { id: true, status: true, isOnline: true, rejectionReason: true } },
      vendor: { select: { id: true, status: true, name: true, slug: true } },
    },
  });
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    status: user.status,
    roles: user.roles.map((r) => r.role.name),
    preferredCurrency: user.preferredCurrency,
    notificationChannel: user.notificationChannel,
    hasPassword: Boolean(user.passwordHash),
    customer: user.customer,
    rider: user.rider,
    vendor: user.vendor,
    createdAt: user.createdAt,
  };
}

export type Profile = Awaited<ReturnType<typeof getProfile>>;

async function issueTokens(userId: string, familyId: string | null, client: ClientInfo) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, phone: true, roles: { select: { role: { select: { name: true } } } } },
  });
  const roles = user.roles.map((r) => r.role.name);
  const accessToken = signAccessToken({ sub: user.id, roles, phone: user.phone });
  const refresh = generateRefreshToken();
  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refresh.hash,
      familyId: familyId ?? refresh.hash.slice(0, 32),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 255),
    },
  });
  return { accessToken, refreshToken: refresh.token, refreshTokenId: record.id };
}

export async function createSession(userId: string, client: ClientInfo) {
  const { accessToken, refreshToken } = await issueTokens(userId, null, client);
  return { accessToken, refreshToken, user: await getProfile(userId) };
}

/**
 * Login after a verified OTP. Creates the account on first login and grants the
 * requested self-service role. ADMIN can never be self-assigned.
 */
export async function loginWithVerifiedPhone(
  phone: string,
  role: RoleName,
  name: string | undefined,
  client: ClientInfo,
) {
  const existing = await prisma.user.findUnique({
    where: { phone },
    include: { roles: { include: { role: true } } },
  });

  if (role === 'ADMIN' && !existing?.roles.some((r) => r.role.name === 'ADMIN')) {
    throw forbidden('This number is not registered as an administrator.');
  }
  if (existing?.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');

  const userId = await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: { phone, name: name?.trim() || null },
      }));
    if (existing && name && !existing.name) {
      await tx.user.update({ where: { id: existing.id }, data: { name: name.trim() } });
    }
    await ensureRole(tx, user.id, role);
    if (role === 'CUSTOMER') {
      await tx.customer.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    }
    return user.id;
  });

  return createSession(userId, client);
}

export async function loginWithPassword(phone: string, password: string, role: RoleName | undefined, client: ClientInfo) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { roles: { include: { role: true } } },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) throw unauthorized('Incorrect phone number or password');
  if (user.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');
  if (role && !user.roles.some((r) => r.role.name === role)) {
    throw forbidden(`This account does not have ${role.toLowerCase()} access.`);
  }
  return createSession(user.id, client);
}

export async function refreshSession(refreshToken: string, client: ClientInfo) {
  const hash = sha256(refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!record) throw unauthorized('Session expired. Please log in again.');

  if (record.revokedAt) {
    // A rotated token was presented again — likely theft. Kill the whole family.
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Session expired. Please log in again.');
  }
  if (record.expiresAt < new Date()) throw unauthorized('Session expired. Please log in again.');

  const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { status: true } });
  if (!user || user.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) throw unauthorized('Session expired. Please log in again.');

  const tokens = await issueTokens(record.userId, record.familyId, client);
  await prisma.refreshToken.update({ where: { id: record.id }, data: { replacedBy: tokens.refreshTokenId } });
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function setPassword(userId: string, newPassword: string, currentPassword?: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash) {
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw badRequest('Your current password is incorrect');
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST) },
  });
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
