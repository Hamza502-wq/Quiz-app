# DoorStep API

Express 5 + TypeScript + Prisma (PostgreSQL) + Socket.IO. See the [root README](../README.md) for the architecture and business rules.

```bash
cp .env.example .env        # fill in secrets
npm install
npx prisma migrate deploy   # or: npm run prisma:migrate (development, creates new migrations)
npm run db:seed
npm run dev                 # http://localhost:4000 — Swagger: /api/docs
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | TypeScript, including tests and seed |
| `npm test` | Vitest unit + end-to-end tests against `TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/doorstep_test`) |
| `npm run db:seed` | Sample data (idempotent for accounts and stores; order history only on an empty orders table) |

## Layout

```
prisma/            schema.prisma, migrations, seed.ts
src/
  config/env.ts    zod-validated environment
  lib/             prisma, logger, errors, route helper (validation + auth + OpenAPI), geo, time, money, tokens
  middleware/      auth (JWT + roles), rate limits, error handler
  modules/
    auth/          OTP, JWT/refresh rotation, password login
    vendors/       public browsing, vendor portal (profile, hours, menu, stock, orders, reports)
    orders/        quotes, vendor & parcel orders, state machine, tracking, presenter
    dispatch/      nearest-rider offers, manual assignment, sweeper
    riders/        registration, online status, live location, delivery flow, payouts
    wallet/        rider ledger, cash-collection reconciliation, bonuses
    payments/      Paynow client (hash/verify/poll), payment service, webhook
    admin/         analytics, payouts & refunds, all admin endpoints
    notifications/ in-app + FCM push + SMS/WhatsApp fallback
    uploads/       sharp-processed images (public + private)
    settings/      platform settings with defaults
  realtime/        Socket.IO server and emit helpers
  jobs/            in-process scheduler
  docs/            OpenAPI document
tests/             unit.test.ts, flow.test.ts (end-to-end)
```

Every route is declared with `defineRoute(...)` in `src/lib/route.ts`, which applies authentication, role checks and zod validation, and registers the endpoint in the OpenAPI document — so the Swagger docs always match the validation.
