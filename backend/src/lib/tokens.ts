import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { RoleName } from '@prisma/client';
import { env } from '../config/env';
import { sha256 } from './random';

export interface AccessTokenPayload {
  sub: string;
  roles: RoleName[];
  phone: string;
}

const ISSUER = 'doorstep-zw';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ roles: payload.roles, phone: payload.phone }, env.JWT_ACCESS_SECRET, {
    subject: payload.sub,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Malformed token');
  return {
    sub: decoded.sub,
    roles: Array.isArray(decoded.roles) ? (decoded.roles as RoleName[]) : [],
    phone: typeof decoded.phone === 'string' ? decoded.phone : '',
  };
}

/** Opaque, high-entropy refresh token; only its SHA-256 is persisted. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: sha256(token) };
}
