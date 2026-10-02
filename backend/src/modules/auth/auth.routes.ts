import { Router, type Request } from 'express';
import { z } from 'zod';
import { defineRoute } from '../../lib/route';
import { passwordSchema, phoneSchema } from '../../lib/validation';
import { loginLimiter, otpRequestIpLimiter, otpRequestPhoneLimiter } from '../../middleware/rateLimit';
import { prisma } from '../../lib/prisma';
import { requestOtp, verifyOtp } from './otp.service';
import {
  getProfile,
  loginWithPassword,
  loginWithVerifiedPhone,
  logout,
  refreshSession,
  registerWithPassword,
  setPassword,
} from './auth.service';

export const authRouter = Router();
const basePath = '/api/v1/auth';
const tags = ['Auth'];

const clientInfo = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const roleSchema = z.enum(['CUSTOMER', 'RIDER', 'VENDOR', 'ADMIN']);

defineRoute(authRouter, {
  method: 'post',
  path: '/otp/request',
  basePath,
  tags,
  summary: 'Send a one-time login code by SMS',
  auth: 'public',
  middleware: [otpRequestIpLimiter, otpRequestPhoneLimiter],
  body: z.object({ phone: phoneSchema }),
  handler: ({ body, req }) => requestOtp(body.phone, req.ip),
});

defineRoute(authRouter, {
  method: 'post',
  path: '/otp/verify',
  basePath,
  tags,
  summary: 'Verify the code and log in (creates the account on first login)',
  description:
    'Returns an access token (JWT, short-lived) and a rotating refresh token. `role` selects the app: CUSTOMER, RIDER or VENDOR are granted on first login; ADMIN must already be assigned.',
  auth: 'public',
  middleware: [loginLimiter],
  body: z.object({
    phone: phoneSchema,
    code: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code from the SMS'),
    role: roleSchema.default('CUSTOMER'),
    name: z.string().trim().min(2).max(80).optional(),
  }),
  handler: async ({ body, req }) => {
    await verifyOtp(body.phone, body.code);
    return loginWithVerifiedPhone(body.phone, body.role, body.name, clientInfo(req));
  },
});

defineRoute(authRouter, {
  method: 'post',
  path: '/register',
  basePath,
  tags,
  summary: 'Create an account with phone number and password',
  description:
    'For customers, riders and vendors. Fails with 409 when the number already has an account. Returns the same token pair as login.',
  auth: 'public',
  middleware: [loginLimiter],
  body: z.object({
    phone: phoneSchema,
    password: passwordSchema,
    name: z.string().trim().min(2, 'Enter your name').max(80),
    role: z.enum(['CUSTOMER', 'RIDER', 'VENDOR']).default('CUSTOMER'),
  }),
  handler: ({ body, req }) => registerWithPassword(body.phone, body.password, body.name, body.role, clientInfo(req)),
});

defineRoute(authRouter, {
  method: 'post',
  path: '/login',
  basePath,
  tags,
  summary: 'Log in with phone number and password',
  auth: 'public',
  middleware: [loginLimiter],
  body: z.object({ phone: phoneSchema, password: z.string().min(1).max(128), role: roleSchema.optional() }),
  handler: ({ body, req }) => loginWithPassword(body.phone, body.password, body.role, clientInfo(req)),
});

defineRoute(authRouter, {
  method: 'post',
  path: '/refresh',
  basePath,
  tags,
  summary: 'Exchange a refresh token for a new token pair (rotation)',
  auth: 'public',
  body: z.object({ refreshToken: z.string().min(20).max(200) }),
  handler: ({ body, req }) => refreshSession(body.refreshToken, clientInfo(req)),
});

defineRoute(authRouter, {
  method: 'post',
  path: '/logout',
  basePath,
  tags,
  summary: 'Revoke a refresh token',
  auth: 'public',
  body: z.object({ refreshToken: z.string().min(20).max(200) }),
  handler: async ({ body }) => {
    await logout(body.refreshToken);
    return { ok: true };
  },
});

defineRoute(authRouter, {
  method: 'get',
  path: '/me',
  basePath,
  tags,
  summary: 'Current user profile',
  auth: 'required',
  handler: ({ user }) => getProfile(user.id),
});

defineRoute(authRouter, {
  method: 'patch',
  path: '/me',
  basePath,
  tags,
  summary: 'Update profile and notification preferences',
  auth: 'required',
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    email: z.string().trim().email().max(120).nullable().optional(),
    preferredCurrency: z.enum(['USD', 'ZWG']).optional(),
    notificationChannel: z.enum(['SMS', 'WHATSAPP']).optional(),
  }),
  handler: async ({ body, user }) => {
    await prisma.user.update({ where: { id: user.id }, data: body });
    return getProfile(user.id);
  },
});

defineRoute(authRouter, {
  method: 'post',
  path: '/password',
  basePath,
  tags,
  summary: 'Set or change the account password',
  auth: 'required',
  body: z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordSchema }),
  handler: async ({ body, user }) => {
    await setPassword(user.id, body.newPassword, body.currentPassword);
    return { ok: true };
  },
});
