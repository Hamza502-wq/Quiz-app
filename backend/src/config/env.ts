import 'dotenv/config';
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.string().min(1),

  // Public URL where this API is reachable (used for uploads and Paynow callbacks)
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // When true (never in production) the OTP is returned in the API response for local testing
  OTP_DEV_ECHO: bool(false),

  // SMS / WhatsApp
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_SMS_FROM: optionalString,
  TWILIO_WHATSAPP_FROM: optionalString,

  // Firebase Cloud Messaging (HTTP v1, service account)
  FCM_PROJECT_ID: optionalString,
  FCM_CLIENT_EMAIL: optionalString,
  FCM_PRIVATE_KEY: optionalString,

  // Paynow Zimbabwe — one integration per currency
  PAYNOW_USD_INTEGRATION_ID: optionalString,
  PAYNOW_USD_INTEGRATION_KEY: optionalString,
  PAYNOW_ZWG_INTEGRATION_ID: optionalString,
  PAYNOW_ZWG_INTEGRATION_KEY: optionalString,
  PAYNOW_AUTH_EMAIL: optionalString,
  PAYNOW_RETURN_URL: optionalString,
  // Simulates Paynow locally: payments confirm automatically a few seconds after initiation
  PAYMENTS_MOCK: bool(false),

  GOOGLE_MAPS_SERVER_KEY: optionalString,

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),

  ENABLE_JOBS: bool(true),

  SEED_ADMIN_PHONE: z.string().default('+263770000001'),
  SEED_ADMIN_PASSWORD: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;

if (data.NODE_ENV === 'production') {
  if (data.OTP_DEV_ECHO) {
    // eslint-disable-next-line no-console
    console.error('❌ OTP_DEV_ECHO must not be enabled in production');
    process.exit(1);
  }
  if (data.PAYMENTS_MOCK) {
    // eslint-disable-next-line no-console
    console.error('❌ PAYMENTS_MOCK must not be enabled in production');
    process.exit(1);
  }
}

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  corsOrigins: data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

export type Env = typeof env;
