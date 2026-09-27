<p align="center">
  <img src="brand/doorstep-logo.png" alt="DoorStep Zimbabwe" width="280" />
</p>

# DoorStep Zimbabwe

On-demand delivery for Zimbabwe — food, groceries, pharmacy and parcels — with EcoCash, OneMoney, card and cash on delivery, prices in **USD and ZiG**, live rider tracking and a full rider cash/earnings ledger.

| Part | Tech | Folder |
| --- | --- | --- |
| **API** | Node.js 22 · Express 5 · TypeScript · PostgreSQL + Prisma · Socket.IO · Swagger | [`backend/`](backend) |
| **Customer app** | Flutter (Android first, iOS-ready) | [`apps/customer_app/`](apps/customer_app) |
| **Rider app** | Flutter (Android first, iOS-ready) | [`apps/rider_app/`](apps/rider_app) |
| Shared Flutter code | API client, auth, models, theme, widgets | [`packages/doorstep_core/`](packages/doorstep_core) |
| **Vendor dashboard** | Next.js 16 · TypeScript · Tailwind 4 | [`web/vendor-dashboard/`](web/vendor-dashboard) |
| **Admin panel** | Next.js 16 · TypeScript · Tailwind 4 | [`web/admin-panel/`](web/admin-panel) |
| Shared web code | API client, auth, UI kit, maps | [`web/shared/`](web/shared) |
| Brand assets | Logo, house-and-door icon, Poppins | [`brand/`](brand) |

---

## Quick start (local)

**Requirements:** Node.js ≥ 20, PostgreSQL 14+ (or Docker), Flutter 3.47+ (Dart 3.13+) with the Android SDK.

```bash
# 1. API
cd backend
cp .env.example .env            # set JWT_ACCESS_SECRET / OTP_SECRET (openssl rand -hex 32) and DATABASE_URL
npm install
npx prisma migrate deploy       # create tables
npm run db:seed                 # sample vendors, products, riders, customers & two weeks of orders
npm run dev                     # http://localhost:4000 · Swagger at http://localhost:4000/api/docs

# 2. Web dashboards (in another terminal)
cd web
npm install
cp vendor-dashboard/.env.example vendor-dashboard/.env.local
cp admin-panel/.env.example admin-panel/.env.local
npm run dev:vendor              # http://localhost:3000
npm run dev:admin               # http://localhost:3001

# 3. Mobile apps (Android emulator reaches the host API at 10.0.2.2)
cd apps/customer_app && flutter run
cd apps/rider_app && flutter run
# Physical phone: flutter run --dart-define=API_URL=http://<your-computer-LAN-IP>:4000
```

Or run the API, database and both dashboards with Docker:

```bash
cp .env.example .env            # set JWT_ACCESS_SECRET and OTP_SECRET
docker compose up --build
(cd backend && DATABASE_URL=postgresql://doorstep:doorstep@localhost:5432/doorstep npm run db:seed)
```

### Seeded test accounts

With `OTP_DEV_ECHO=true` (development only) the SMS code is returned by the API and shown under the code field, so no SMS provider is needed.

| Role | Phone | Password (web) |
| --- | --- | --- |
| Admin | `0770 000 001` | `DoorStep@2026` |
| Vendors | `0772 000 101` (Sadza Republic) … `0772 000 105` | `DoorStep@2026` |
| Riders (approved) | `0773 000 201` … `0773 000 204` | — (SMS code) |
| Rider (pending approval) | `0773 000 205` | — |
| Customers | `0774 000 301`, `0774 000 302` | — (SMS code) |

`PAYMENTS_MOCK=true` simulates Paynow: EcoCash/OneMoney/card payments confirm ~5 seconds after they start.

---

## Architecture

```
 Customer app ─┐                       ┌─ PostgreSQL (Prisma)
 Rider app ────┼── REST /api/v1 ──► API ┼─ Paynow (EcoCash · OneMoney · card)
 Vendor web ───┤   Socket.IO           ├─ Twilio (SMS · WhatsApp)   ├─ FCM (push)
 Admin web ────┘                       └─ Google Distance Matrix (optional)
```

* **Auth:** phone number + 6-digit SMS OTP (HMAC-hashed, 5-minute expiry, 5 attempts, 30-second resend cooldown, per-phone and per-IP rate limits). Returns a 15-minute **JWT access token** and an opaque **rotating refresh token** (SHA-256 stored; reusing a rotated token revokes the whole session family). Vendors and admins can also set a bcrypt password for the web dashboards. Roles: `CUSTOMER`, `RIDER`, `VENDOR`, `ADMIN` (admin can never be self-assigned).
* **Real time:** Socket.IO authenticated with the access token. Rooms per user, rider, vendor, order and admins. Events: `order:updated`, `order:rider_location` (with ETA), `dispatch:offer`, `vendor:new_order`, `chat:message`, `notification`, `rider:location` (admin live map). REST fallbacks exist for every live feature (low-data mode).
* **Money:** integer US-dollar cents everywhere. Each order stores the ZiG exchange rate used (`settings.zigPerUsd`), the currency the customer chose, and the amount charged in that currency.
* **Background jobs** (in-process, one instance): dispatch sweep (offer expiry, re-offers) every 10 s, pending-payment polling every 30 s, unpaid-order expiry every minute, weekly rider payouts hourly check.

### Order lifecycle

```
PENDING_PAYMENT ──paid──► PLACED ──store accepts (prep time)──► ACCEPTED ──► READY_FOR_PICKUP
       │                    │  └── REJECTED (auto refund if paid)              │
       └── CANCELLED        └── CANCELLED (customer, before acceptance)        ▼
                                                  PICKED_UP ──► ON_THE_WAY ──► DELIVERED (PIN or photo)
```
Parcel orders skip the store steps: `PLACED → PICKED_UP → ON_THE_WAY → DELIVERED`. Cash orders start at `PLACED`.

### Dispatch

When a store accepts an order (or a parcel is placed) and **auto-dispatch** is on, the nearest eligible rider gets an offer with a countdown (default 45 s). Riders must be approved, online, have a GPS fix newer than 10 minutes, no active delivery, be within the dispatch radius, and — for cash orders — have room under their **cash limit**. Declines or timeouts go to the next nearest rider. Admins can assign manually (with a nearest-rider list), unassign, or trigger "offer to nearest" from the live map.

### Pricing, commission and rider pay

* Delivery fee = `base + perKm × distance` (minimum fee applies); zones can override base/per-km.
* Distance uses Google Distance Matrix when `GOOGLE_MAPS_SERVER_KEY` is set, otherwise haversine × 1.3.
* Commission = subtotal × commission rate (global default or per-vendor override). Vendor earning = subtotal − commission.
* Rider pay = `riderBase + riderPerKm × distance` (zone override possible) + **100% of tips** + **bonuses** (e.g. "10 deliveries in a day → US$3").
* Platform revenue = commission + delivery fee − rider pay.

### Cash on delivery

When a rider completes a cash order the wallet is credited with their pay and tip and **debited with the full cash collected**. The result is recorded as a `cash_collections` entry: cash they hold is owed to DoorStep and is netted against earnings (collections are settled oldest-first as the balance recovers). A negative balance = cash owed. Riders whose owed cash + the order total would exceed their **cash limit** (global default, per-rider override) are skipped for cash orders until they remit cash (recorded by an admin) or earn it off.

### Payouts

* **Riders:** payouts to EcoCash, OneMoney or bank. Weekly by default — an automatic batch runs on the configured day for every rider with a balance above the minimum and saved payout details; riders can also request one payout per week (or any time if `allowOnDemandPayouts` is on). The amount is held from the wallet immediately; a rejected payout is reversed.
* **Vendors:** balance = delivered-order earnings − payouts. Admins generate vendor payouts in bulk or per vendor and record the transfer reference when paid.

### Payments (Paynow Zimbabwe)

The API implements Paynow's HTTP protocol directly ([`paynow.client.ts`](backend/src/modules/payments/paynow.client.ts)) — SHA-512 hash generation and verification (tested against Paynow's published example), express checkout for EcoCash/OneMoney (USSD push to the customer's phone), web checkout for cards, result-URL callbacks, and polling. Each currency needs its own Paynow integration (`PAYNOW_USD_*`, `PAYNOW_ZWG_*`). In Paynow test mode, `PAYNOW_AUTH_EMAIL` must be the merchant's registered email.

---

## Configuration

Every secret comes from environment variables; nothing is hard-coded.

| Where | File | Key settings |
| --- | --- | --- |
| API | `backend/.env` ([example](backend/.env.example)) | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `OTP_SECRET`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `SMS_PROVIDER`/`TWILIO_*`, `FCM_*`, `PAYNOW_*`, `GOOGLE_MAPS_SERVER_KEY`, `OTP_DEV_ECHO`, `PAYMENTS_MOCK` |
| Dashboards | `web/*/.env.local` ([example](web/vendor-dashboard/.env.example)) | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` |
| Mobile apps | `--dart-define` or `--dart-define-from-file=config/dev.json` ([example](apps/customer_app/config/dev.example.json)) | `API_URL`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID` |
| Android Maps key | `apps/*/android/local.properties` | `MAPS_API_KEY=...` (or a Gradle property / env var) |
| iOS Maps key | `apps/*/ios/Flutter/Secrets.xcconfig` | `GOOGLE_MAPS_API_KEY = ...` |
| Android release signing | `apps/*/android/key.properties` | `storeFile`, `storePassword`, `keyAlias`, `keyPassword` |

The API refuses to start in production with `OTP_DEV_ECHO` or `PAYMENTS_MOCK` enabled.

Platform settings (commission, delivery fees, rider pay, parcel surcharges, cash limit, ZiG rate, dispatch radius/timeout, payout day, tip cap…) live in the database and are edited in **Admin → Settings & zones**.

---

## Features by app

**Customer app** — SMS sign-in · browse by category (food, groceries, pharmacy, parcels) with search, "open now" filter and sorting by rating/distance/fee · live open/closed status and opening hours · menus with stock-aware ordering · single-store cart that survives restarts · saved addresses with **map pin-drop + landmark description** · checkout with USD/ZiG toggle, tip, EcoCash/OneMoney/card/cash · Paynow payment screen with retry · **live tracking map** with rider position, ETA, status timeline and delivery PIN · call/chat the rider · order history, reorder, ratings & reviews, post-delivery tipping, dispute reporting · parcel sending · notification inbox (push, SMS/WhatsApp fallback preference) · **low-data mode** (thumbnails, lite maps, slower polling).

**Rider app** — registration with national ID, licence and vehicle photos (private uploads) · approval status screen with resubmission · online/offline toggle with background location (Android foreground service) · delivery request sheet with countdown, earnings and cash-to-collect · navigation hand-off to Google Maps · call/chat customer · picked up → on the way → delivered · **proof of delivery by customer PIN or photo** · wallet with earnings, tips, bonuses, cash owed vs limit and ledger · payout requests to EcoCash/OneMoney/bank · delivery history · low-data mode.

**Vendor dashboard** — self-service onboarding (pending approval) · store profile, logo/cover, map location, landmark, prep time, minimum order, payout details · weekly opening hours · menu sections and products with photos, prices, availability and stock (+/−) · **live orders board** with sound alerts: accept with prep time, reject with reason, mark ready · order history · sales reports with charts, top products, **commission statements** (CSV export) · payout history and balance.

**Admin panel** — KPIs and analytics (orders, GMV, platform revenue, completion rate, active/new customers, payment mix, top vendors, **rider performance**: deliveries, average time, acceptance rate, rating) · **live map** of active orders and online riders with manual/automatic assignment · order search, detail timeline, dispatch history, cancel/unassign · approve/reject/suspend vendors and riders (document viewer) · commission overrides, zones, cash limits, cash remittances, wallet bonuses/adjustments · disputes with refunds and a refunds queue · rider/vendor payout processing and batches · platform settings, service zones (map), bonus rules, categories · user suspension and admin management.

---

## Database

PostgreSQL schema: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) (migration in `backend/prisma/migrations`).

Core tables: `users`, `roles` (+ `user_roles`), `customers`, `riders`, `vendors`, `products`, `categories`, `orders`, `order_items`, `addresses`, `payments`, `rider_wallets`, `wallet_transactions`, `cash_collections`, `payouts`, `ratings`, `notifications`, `zones`, `settings`.
Supporting tables: `otp_codes`, `refresh_tokens`, `device_tokens`, `vendor_opening_hours`, `menu_sections`, `order_events`, `dispatch_offers`, `chat_messages`, `refunds`, `disputes`, `bonus_rules`, `bonus_awards`.

## API documentation

Interactive Swagger UI at **`/api/docs`** (OpenAPI JSON at `/api/docs.json`), generated from the same zod schemas that validate requests. All errors use `{ "error": { "code", "message", "details?" } }`.

## Testing

```bash
cd backend && npm test                     # 42 unit, end-to-end and Socket.IO tests (needs a *test* PostgreSQL database)
cd backend && npm run typecheck && npm run build
cd web && npm run build                    # type-checks and builds both dashboards
cd packages/doorstep_core && flutter analyze && flutter test
cd apps/customer_app && flutter analyze && flutter test
cd apps/rider_app && flutter analyze && flutter test
# Contract test: Flutter models against a running, seeded API (OTP_DEV_ECHO=true, PAYMENTS_MOCK=true)
cd packages/doorstep_core && DOORSTEP_API_URL=http://localhost:4000 flutter test test/api_contract_test.dart
```

Backend tests default to `postgresql://postgres:postgres@localhost:5432/doorstep_test` (override with `TEST_DATABASE_URL`) and refuse to truncate a database whose URL doesn't contain "test". GitHub Actions runs everything above on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Production checklist

* `NODE_ENV=production`, strong unique secrets, `OTP_DEV_ECHO=false`, `PAYMENTS_MOCK=false`.
* `PUBLIC_BASE_URL` must be the public HTTPS URL of the API so Paynow can reach `/api/v1/payments/paynow/result`.
* Configure `SMS_PROVIDER=twilio` (SMS + WhatsApp sender), FCM service-account credentials, Paynow USD/ZWG integrations, and restricted Google Maps keys (server key for the API, browser key for dashboards, Android/iOS keys for apps).
* Run background jobs on exactly one API instance (`ENABLE_JOBS=true` there, `false` elsewhere). Socket.IO and the in-memory PIN attempt limiter assume a single instance — add the Socket.IO Redis adapter before scaling out.
* Uploaded images are stored on local disk (`UPLOAD_DIR`); mount a persistent volume or move to object storage. ID documents and delivery photos are private and served only to admins, their owner, and (for proof photos) the order's customer.
* Dashboards keep tokens in `localStorage`; serve them over HTTPS with a strict CSP.
* Set `TRUST_PROXY` to the number of reverse proxies so rate limiting sees real client IPs.
* Replace the Android debug signing fallback with `android/key.properties`, and set the Firebase and Maps keys for release builds.

## Build order (as delivered)

1. Database schema + backend auth — `backend/prisma`, `backend/src/modules/auth`
2. Vendor onboarding + product management — `modules/vendors`, vendor dashboard
3. Customer ordering + checkout — `modules/orders`, `modules/pricing`, customer app
4. Manual rider assignment + rider app — `modules/dispatch`, `modules/riders`, rider app
5. Payments (Paynow) — `modules/payments`
6. Live tracking — `realtime/`, tracking endpoints, map screens
7. Auto-dispatch, analytics, payouts — `dispatch.service.ts`, `admin/analytics.service.ts`, payout services, admin panel

## Brand

Orange `#FF7A00` (primary) · Black `#1A1A1A` (text/icons) · Red `#E01E1E` (location pins/alerts) · White `#FFFFFF` (background) · Zimbabwe flag stripes as small accents. Headings in **Poppins** (bundled, SIL Open Font License). The full logo appears on splash, login and headers; the house-and-door mark is the app icon and favicon.
