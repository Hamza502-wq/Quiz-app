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

/** Signed-in routes count per account (routes run authentication before this). */
const userKey = (req: Request) => (req.user ? `user:${req.user.id}` : ipKey(req));

/**
 * Chat messages (order and marketplace): 20 per minute per account. In-memory, so on
 * serverless hosting each instance counts separately; the marketplace also checks a
 * database-backed limit that holds across instances.
 */
export const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey,
  skip,
  message: message('You are sending messages too fast. Wait a moment and try again.'),
});

/** Auction bids: 12 per minute per account (plus a database-backed limit). */
export const bidLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey,
  skip,
  message: message('Too many bids. Wait a moment and try again.'),
});

/** Swap offers and counter offers: 20 per 10 minutes per account. */
export const offerLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey,
  skip,
  message: message('Too many offers. Try again in a few minutes.'),
});

/**
 * Marketplace phrase searches and saved searches: 30 per minute per account (per IP when signed
 * out), since each phrase may call the AI service. Browsing without a phrase isn't counted.
 */
export const searchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey,
  skip: (req) => env.isTest || (req.method === 'GET' && !(typeof req.query.q === 'string' && req.query.q.trim())),
  message: message('Too many searches. Wait a moment and try again.'),
});
