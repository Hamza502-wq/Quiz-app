import type { NextFunction, Request, Response } from 'express';
import type { RoleName } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthUser {
  id: string;
  phone: string;
  roles: RoleName[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;
const lastSeenCache = new Map<string, number>();

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Resolves and validates the user behind an access token (also used by Socket.IO). */
export async function resolveUser(token: string): Promise<AuthUser> {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, phone: true, status: true, roles: { select: { role: { select: { name: true } } } } },
  });
  if (!user) throw unauthorized('Account no longer exists');
  if (user.status === 'SUSPENDED') throw forbidden('Your account has been suspended. Contact support.');

  const now = Date.now();
  if ((lastSeenCache.get(user.id) ?? 0) < now - LAST_SEEN_INTERVAL_MS) {
    lastSeenCache.set(user.id, now);
    prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(now) } }).catch(() => undefined);
  }
  // Roles come from the database so revocations apply immediately.
  return { id: user.id, phone: user.phone, roles: user.roles.map((r) => r.role.name) };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req);
  if (!token) return next(unauthorized());
  try {
    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches req.user when a valid token is present; otherwise continues anonymously. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch {
    // ignore — treat as anonymous
  }
  next();
}

export function requireRoles(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.some((r) => req.user!.roles.includes(r))) return next(forbidden());
    next();
  };
}
