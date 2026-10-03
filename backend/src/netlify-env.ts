import { serverlessDatabaseUrl } from './lib/database-url';

/**
 * Production defaults for the Netlify deployment. Imported first by the
 * Netlify functions, before the app reads its configuration. Variables set in
 * the Netlify UI always win. Only DATABASE_URL has to be provided there.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'production',
  // No persistent disk on Netlify Functions: keep uploaded images in Postgres.
  UPLOAD_STORAGE: 'database',
  // The function forwards the visitor's address as a single proxy hop.
  TRUST_PROXY: '1',
  // Jobs run from the scheduled "jobs" function instead of in-process timers.
  ENABLE_JOBS: 'false',
  // Signing secrets are derived from DATABASE_URL unless set explicitly.
  SECRETS_FROM_DATABASE_URL: 'true',
  LOG_LEVEL: 'info',
};

// Payments are simulated until Paynow credentials are added.
if (!process.env.PAYNOW_USD_INTEGRATION_ID && !process.env.PAYNOW_ZWG_INTEGRATION_ID) {
  defaults.PAYMENTS_MOCK = 'true';
  defaults.ALLOW_PAYMENTS_MOCK_IN_PRODUCTION = 'true';
}

// Netlify provides the site's primary URL to functions.
if (process.env.URL) {
  defaults.PUBLIC_BASE_URL = process.env.URL;
  defaults.CORS_ORIGINS = process.env.URL;
}

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}

if (process.env.DATABASE_URL) process.env.DATABASE_URL = serverlessDatabaseUrl(process.env.DATABASE_URL);

