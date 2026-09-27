import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/doorstep_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0123456789',
      OTP_SECRET: 'test-otp-secret-test-otp-secret-test-otp-0123456789',
      OTP_DEV_ECHO: 'true',
      PAYMENTS_MOCK: 'true',
      ENABLE_JOBS: 'false',
      PUBLIC_BASE_URL: 'http://localhost:4000',
      UPLOAD_DIR: 'tmp-test-uploads',
      SMS_PROVIDER: 'console',
      LOG_LEVEL: 'silent',
      // Public test credentials from the Paynow integration guide (hash vectors only; never called).
      PAYNOW_USD_INTEGRATION_ID: '1201',
      PAYNOW_USD_INTEGRATION_KEY: '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977',
    },
  },
});
