import { z } from 'zod';
import { normalizePhone } from './phone';
import { normalizeZwPlate, ZW_PLATE_HINT } from './plate';

/** Accepts local or international formats and outputs E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 0771 234 567' });
      return z.NEVER;
    }
    return normalized;
  });

/** Zimbabwean number plate, output as "ABC 1234". */
export const zwPlateSchema = z
  .string()
  .trim()
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizeZwPlate(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: ZW_PLATE_HINT });
      return z.NEVER;
    }
    return normalized;
  });

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const moneyCents = z.number().int().min(0).max(100_000_000);

/** A URL produced by our upload endpoint or any https URL. */
export const imageUrl = z.string().trim().url().max(500);

export const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));
