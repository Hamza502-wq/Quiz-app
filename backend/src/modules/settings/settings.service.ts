import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Platform-wide settings managed from the admin panel. Stored as one row per key
 * in the `settings` table; missing keys fall back to these defaults.
 */
export const settingsSchema = z.object({
  commissionRateBps: z.number().int().min(0).max(10_000).default(1500),
  deliveryFeeBaseCents: z.number().int().min(0).default(150),
  deliveryFeePerKmCents: z.number().int().min(0).default(50),
  minDeliveryFeeCents: z.number().int().min(0).default(200),
  riderBaseCents: z.number().int().min(0).default(100),
  riderPerKmCents: z.number().int().min(0).default(40),
  parcelSurchargeCents: z
    .object({
      SMALL: z.number().int().min(0),
      MEDIUM: z.number().int().min(0),
      LARGE: z.number().int().min(0),
    })
    .default({ SMALL: 0, MEDIUM: 100, LARGE: 250 }),
  maxDeliveryKm: z.number().positive().max(200).default(25),
  defaultCashLimitCents: z.number().int().min(0).default(5000),
  zigPerUsd: z.number().positive().default(26.8),
  riderAvgSpeedKmh: z.number().positive().max(120).default(25),
  autoDispatchEnabled: z.boolean().default(true),
  dispatchRadiusKm: z.number().positive().max(100).default(8),
  dispatchOfferTimeoutSec: z.number().int().min(10).max(600).default(45),
  riderLocationStaleMinutes: z.number().int().min(1).max(120).default(10),
  minPayoutCents: z.number().int().min(0).default(500),
  payoutDayOfWeek: z.number().int().min(0).max(6).default(1), // Monday (Harare)
  allowOnDemandPayouts: z.boolean().default(false),
  pendingPaymentTimeoutMinutes: z.number().int().min(5).max(1440).default(30),
  maxTipCents: z.number().int().min(0).default(5000),
  supportPhone: z.string().default('+263242000000'),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;
export const settingsUpdateSchema = settingsSchema.partial();

const CACHE_TTL_MS = 30_000;
let cache: { value: PlatformSettings; at: number } | null = null;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const rows = await prisma.setting.findMany();
  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = row.value;
  // Unknown or invalid stored keys are dropped so a bad value can't brick the platform.
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchema.shape) as Array<keyof PlatformSettings>) {
    const fieldSchema = settingsSchema.shape[key];
    const parsed = fieldSchema.safeParse(raw[key]);
    merged[key] = parsed.success ? parsed.data : fieldSchema.parse(undefined);
  }
  const value = settingsSchema.parse(merged);
  cache = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<PlatformSettings>, userId: string): Promise<PlatformSettings> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: userId },
        update: { value: value as Prisma.InputJsonValue, updatedById: userId },
      }),
    ),
  );
  cache = null;
  return getSettings();
}

export function clearSettingsCache(): void {
  cache = null;
}
