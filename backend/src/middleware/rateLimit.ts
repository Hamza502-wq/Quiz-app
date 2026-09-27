import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { normalizePhone } from '../lib/phone';

const message = (msg: string) => ({ error: { code: 'TOO_MANY_REQUESTS', message: msg } });
const skip = () => env.isTest;

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? '0.0.0.0');
const phoneKey = (req: Request) => {
  const raw = typeof req.body?.phone === 'string' ? req.body.phone : '';
  return `phone:${normalizePhone(raw) ?? raw.slice(0, 20)}`;
};

/** General API limiter (per IP). */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip,
  message: message('Too many requests. Please slow down.'),
});

/** OTP sends: 5 per phone per 15 minutes. */
export const otpRequestPhoneLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: phoneKey,
  skip,
  message: message('Too many codes requested for this number. Try again in 15 minutes.'),
});

/** OTP sends: 20 per IP per 15 minutes (stops number enumeration / SMS pumping). */
export const otpRequestIpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip,
  message: message('Too many codes requested. Try again later.'),
});

/** Login / verify attempts: 10 per phone per 15 minutes. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: phoneKey,
  skip,
  message: message('Too many attempts. Try again in 15 minutes.'),
});
