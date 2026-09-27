import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest, tooMany } from '../../lib/errors';
import { hmacSha256, randomDigits, safeEqual } from '../../lib/random';
import { sendMessage } from '../notifications/sms.provider';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_MS = 30_000;

function hashCode(phone: string, code: string): string {
  return hmacSha256(`${phone}:${code}`, env.OTP_SECRET);
}

export interface OtpRequestResult {
  expiresInSec: number;
  /** Only present when OTP_DEV_ECHO=true outside production. */
  devCode?: string;
}

export async function requestOtp(phone: string, ip?: string): Promise<OtpRequestResult> {
  const latest = await prisma.otpCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw tooMany('Please wait 30 seconds before requesting another code.');
  }

  const code = randomDigits(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  await prisma.$transaction([
    // Only the newest code is ever valid.
    prisma.otpCode.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.otpCode.create({ data: { phone, codeHash: hashCode(phone, code), expiresAt, ip } }),
  ]);

  const minutes = Math.round(env.OTP_TTL_SECONDS / 60);
  await sendMessage(
    phone,
    `Your DoorStep code is ${code}. It expires in ${minutes} minutes. Never share this code with anyone.`,
    'SMS',
  );

  return {
    expiresInSec: env.OTP_TTL_SECONDS,
    ...(env.OTP_DEV_ECHO && !env.isProduction ? { devCode: code } : {}),
  };
}

/** Verifies and consumes the current code for `phone`. Throws on failure. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw badRequest('This code has expired. Please request a new one.');
  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw tooMany('Too many incorrect attempts. Please request a new code.');
  }

  if (!safeEqual(otp.codeHash, hashCode(phone, code))) {
    const updated = await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const remaining = Math.max(0, env.OTP_MAX_ATTEMPTS - updated.attempts);
    throw badRequest(
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Please request a new code.',
    );
  }

  // Atomic consume so the same code can't be used twice concurrently.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw badRequest('This code has already been used. Please request a new one.');
}
