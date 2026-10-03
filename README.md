<p align="center">
  <img src="brand/doorstep-logo.png" alt="DoorStep Zimbabwe" width="280" />
</p>

# DoorStep Zimbabwe

On-demand delivery for Zimbabwe — food, groceries, pharmacy, electronics, clothing, hardware and any other kind of shop, plus parcels — with EcoCash, OneMoney, card and cash on delivery, prices in **USD and ZiG**, live rider tracking and a full rider cash/earnings ledger.

Made by **Hamza Protech Solutions**.

Every account can have a profile photo; riders must add one (with their Zimbabwean number plate, e.g. `AEZ 1234`, for motorbikes and cars) and shops must add a logo or shop-front photo before they are reviewed. The apps open with a short animation of the DoorStep scooter riding up to the house, and show skeleton placeholders while content loads.

| Part | Tech | Folder |
| --- | --- | --- |
| **API** | Node.js 22 · Express 5 · TypeScript · PostgreSQL + Prisma · Socket.IO · Swagger | [`backend/`](backend) |
| **Customer app** | Flutter (Android first, iOS-ready) | [`apps/customer_app/`](apps/customer_app) |
| **Rider app** | Flutter (Android first, iOS-ready) | [`apps/rider_app/`](apps/rider_app) |
| Shared Flutter code | API client, auth, models, theme, widgets | [`packages/doorstep_core/`](packages/doorstep_core) |
| **Customer website** | Next.js 16 · TypeScript · Tailwind 4 | [`web/customer-web/`](web/customer-web) |
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

# 2. Website and dashboards (in another terminal)
cd web
npm install
cp customer-web/.env.example customer-web/.env.local
cp vendor-dashboard/.env.example vendor-dashboard/.env.local
cp admin-panel/.env.example admin-panel/.env.local
npm run dev:customer            # customer website · http://localhost:3002
npm run dev:vendor              # http://localhost:3000
npm run dev:admin               # http://localhost:3001

# 3. Mobile apps (Android emulator reaches the host API at 10.0.2.2)
cd apps/customer_app && flutter run
cd apps/rider_app && flutter run
# Physical phone: flutter run --dart-define=API_URL=http://<your-computer-LAN-IP>:4000
```

Or run the API, database, customer website and both dashboards with Docker (only Docker Desktop needed). The website is then at http://localhost:3002:

```bash
cp .env.example .env            # set JWT_ACCESS_SECRET and OTP_SECRET (any random strings of 32+ characters)
docker compose up --build -d
docker compose run --rm seed    # sample data; safe to run again
```

On Windows PowerShell, use `copy .env.example .env`, and for local testing generate each secret with
`-join ((1..32) | % { '{0:x2}' -f (Get-Random -Maximum 256) })`.

## Deploy on Netlify (whole platform, one site)

[`netlify.toml`](netlify.toml) and [`scripts/netlify-build.sh`](scripts/netlify-build.sh) put everything on a single Netlify site, with the data in PostgreSQL (e.g. Supabase):

| Path | What |
| --- | --- |
| `/` | Customer website (installable on phones as an app) |
| `/vendor/` | Shop dashboard: sign up, list a shop, manage menu and orders |
| `/admin/` | Admin panel |
| `/rider/` | Rider app (the Flutter app built for the web; prebuilt in `web/rider-web`) |
| `/api/*` | The DoorStep API on Netlify Functions, plus a once-a-minute `jobs` function (dispatch, payment checks, payouts) |

How this differs from running the API on a server:
* **Accounts use phone number + password** (sign-up for customers, shops and riders) until an SMS provider is connected; SMS-code sign-in then works as well (`SMS_PROVIDER=twilio`, and `NEXT_PUBLIC_SMS_SIGN_IN=true` for the web apps).
* **Payments are simulated** until Paynow credentials are added (`PAYNOW_*`); the apps say so at checkout.
* **No live sockets on serverless:** screens refresh every few seconds instead (orders board, tracking, chat, rider requests).
* **Uploaded images are stored in the database** (`UPLOAD_STORAGE=database`).

Setup:
1. Create a PostgreSQL database, apply the schema and the baseline data (roles, categories, delivery zones, exchange rate). From `backend/`: `DATABASE_URL=… npx prisma migrate deploy`, then run [`prisma/production-baseline.sql`](backend/prisma/production-baseline.sql) (e.g. in Supabase's SQL editor). No stores or users are created. On Supabase the script also enables row level security on every table and removes the `anon`/`authenticated` grants, so nothing is readable through Supabase's public Data API keys (the API connects directly as the table owner and is unaffected).
2. In Netlify, import the GitHub repository (Site configuration → Build & deploy → Link repository). Build settings come from `netlify.toml`.
3. Add the environment variable **`DATABASE_URL`** (for Supabase: *Connect → Transaction pooler*, port 6543). Everything else has production defaults (see [`backend/src/netlify-env.ts`](backend/src/netlify-env.ts)); signing secrets are derived from `DATABASE_URL` unless `JWT_ACCESS_SECRET` / `OTP_SECRET` are set.
4. Optional: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Google Maps for the location picker, live map and rider app; redeploy after adding it. Without it, locations are picked on an OpenStreetMap map with place search), `PAYNOW_*`, `TWILIO_*`, `FCM_*`.
5. **First admin:** sign up on the site, then give that account the ADMIN role in the database:
   ```sql
   INSERT INTO user_roles (user_id, role_id)
   SELECT u.id, r.id FROM users u, roles r WHERE u.phone = '+26377XXXXXXX' AND r.name = 'ADMIN'
   ON CONFLICT DO NOTHING;
   ```
   Sign in at `/admin/` with the same phone number and password. More admins can be added from the admin panel.

After changing `apps/rider_app` or `packages/doorstep_core`, run `scripts/build-rider-web.sh` (needs Flutter) and commit `web/rider-web`; Netlify's build has no Flutter SDK. The rider web app loads Flutter's renderer (CanvasKit) from Google's CDN.

**Website demo without a backend:** `npm run build:demo -w @doorstep/customer-web` (in `web/`) still exports a self-contained demo of the customer website (sample stores, simulated deliveries, code `123456`) that can be dragged onto [Netlify Drop](https://app.netlify.com/drop). Details in [`web/README.md`](web/README.md).

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
| API | `backend/.env` ([example](backend/.env.example)) | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `OTP_SECRET`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `SMS_PROVIDER`/`TWILIO_*`, `FCM_*`, `PAYNOW_*`, `GOOGLE_MAPS_SERVER_KEY`, `OTP_DEV_ECHO`, `PAYMENTS_MOCK`, `ANTHROPIC_API_KEY` (optional, AI search) |
| Website & dashboards | `web/*/.env.local` ([example](web/vendor-dashboard/.env.example)) | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` |
| Mobile apps | `--dart-define` or `--dart-define-from-file=config/dev.json` ([example](apps/customer_app/config/dev.example.json)) | `API_URL`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID` |
| Android Maps key | `apps/*/android/local.properties` | `MAPS_API_KEY=...` (or a Gradle property / env var) |
| iOS Maps key | `apps/*/ios/Flutter/Secrets.xcconfig` | `GOOGLE_MAPS_API_KEY = ...` |
| Android release signing | `apps/*/android/key.properties` | `storeFile`, `storePassword`, `keyAlias`, `keyPassword` |

The API refuses to start in production with `OTP_DEV_ECHO` or `PAYMENTS_MOCK` enabled.

Platform settings (commission, delivery fees, rider pay, parcel surcharges, cash limit, ZiG rate, dispatch radius/timeout, payout day, tip cap…) live in the database and are edited in **Admin → Settings & zones**.

---

## Features by app

**Customer app** — SMS sign-in · browse by category (food, groceries, pharmacy, parcels) with search, "open now" filter and sorting by rating/distance/fee · live open/closed status and opening hours · menus with stock-aware ordering · single-store cart that survives restarts · saved addresses with **map pin-drop + landmark description** · checkout with USD/ZiG toggle, tip, EcoCash/OneMoney/card/cash · Paynow payment screen with retry · **live tracking map** with rider position, ETA, status timeline and delivery PIN · call the store and rider · **order chat with the store and rider** (unread badges) · order history, reorder, ratings & reviews, post-delivery tipping, dispute reporting · parcel sending · notification inbox (push, SMS/WhatsApp fallback preference) · **low-data mode** (thumbnails, lite maps, slower polling).

**Customer website** — the customer app in the browser, sharing the same API and accounts: SMS sign-in (accounts are created on first verification) · browse stores by category with search, "open now" and sorting, plus delivery fee and time for your location (browser geolocation, saved address or map pin) · store pages with menu search, opening hours and reviews · single-store cart saved in the browser · checkout with saved addresses (map pin + landmark), USD/ZiG, tip and EcoCash/OneMoney/card/cash · Paynow payment status with retry · **live order tracking** over Socket.IO with status timeline, rider map and ETA, delivery PIN, call buttons and an **order chat with the store and rider** (unread badges in the order list) · cancel, rate, tip, report a problem, order again · parcel sending · profile, preferences and saved addresses · responsive down to phone width.

**DoorStep Market (customer website, `/market`)** — anyone signed in can open a **seller storefront** (shop name, area, map location, optional WhatsApp number) and manage listings from a dashboard: items or services, up to 8 photos, add · edit · mark sold · put back on sale · delete · **direct chat** between buyer and seller (live, with unread badges) plus a **"Chat on WhatsApp"** button that opens `wa.me` with the listing's title, price, area and link filled in (the number is only shown to signed-in buyers, and only if the seller allows it) · **barter**: offer 1–5 of your own items plus optional cash for a listing marked "open to swaps"; the other side accepts, declines or counters, and accepting marks every item in the swap as sold and opens a chat · **live auctions** with a starting price and end time (5 min–14 days), live countdown and bid updates, minimum bid steps, and a 2-minute extension for late bids; ended auctions go to the highest bidder · **DoorStep AI Search** understands everyday English and Shona ("cheapest plumber near me", "foni yakachipa pasi pe$100 kuMbare") and filters by location — it uses Claude when `ANTHROPIC_API_KEY` is set and a built-in English/Shona parser otherwise · **smart alerts**: follow sellers and save searches to get a notification when a matching listing is posted nearby · chat, bids, offers and searches are rate limited per account (in memory and in the database) · admins remove listings in **Admin → Marketplace** (the seller is told why).

**Rider app** — registration with national ID, licence and vehicle photos (private uploads) · approval status screen with resubmission · online/offline toggle with background location (Android foreground service) · delivery request sheet with countdown, earnings and cash-to-collect · navigation hand-off to Google Maps · **choose a delivery zone** (or any zone) · contacts card to call the store, customer, parcel sender/recipient · order chat with the customer and store from assignment onwards, with unread badges · picked up → on the way → delivered · **proof of delivery by customer PIN or photo** · wallet with earnings, tips, bonuses, cash owed vs limit and ledger · payout requests to EcoCash/OneMoney/bank · delivery history · low-data mode.

**Vendor dashboard** — self-service onboarding (pending approval) · store profile, logo/cover, map location, landmark, prep time, minimum order, payout details · weekly opening hours · menu sections and products with photos, prices, availability and stock (+/−) · **live orders board** with sound alerts: accept with prep time, reject with reason, mark ready · **choose a rider** from the free riders nearby who work in the area · call the customer and rider, order chat with unread badges · order history · sales reports with charts, top products, **commission statements** (CSV export) · payout history and balance.

**Admin panel** — KPIs and analytics (orders, GMV, platform revenue, completion rate, active/new customers, payment mix, top vendors, **rider performance**: deliveries, average time, acceptance rate, rating) · **live map** of active orders and online riders with manual/automatic assignment · order search, detail timeline, dispatch history, read-only order chat, cancel/unassign · approve/reject/suspend vendors and riders (document viewer) · commission overrides, zones, cash limits, cash remittances, wallet bonuses/adjustments · disputes with refunds and a refunds queue · rider/vendor payout processing and batches · platform settings, service zones (map), bonus rules, categories · user suspension and admin management.

---

## Database

PostgreSQL schema: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) (migration in `backend/prisma/migrations`).

Core tables: `users`, `roles` (+ `user_roles`), `customers`, `riders`, `vendors`, `products`, `categories`, `orders`, `order_items`, `addresses`, `payments`, `rider_wallets`, `wallet_transactions`, `cash_collections`, `payouts`, `ratings`, `notifications`, `zones`, `settings`.
Supporting tables: `otp_codes`, `refresh_tokens`, `device_tokens`, `vendor_opening_hours`, `menu_sections`, `order_events`, `dispatch_offers`, `chat_messages`, `chat_reads`, `refunds`, `disputes`, `bonus_rules`, `bonus_awards`.

## API documentation

Interactive Swagger UI at **`/api/docs`** (OpenAPI JSON at `/api/docs.json`), generated from the same zod schemas that validate requests. All errors use `{ "error": { "code", "message", "details?" } }`.

## Testing

```bash
cd backend && npm test                     # 42 unit, end-to-end and Socket.IO tests (needs a *test* PostgreSQL database)
cd backend && npm run typecheck && npm run build
cd web && npm run build                    # type-checks and builds the website and both dashboards
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
* Configure `SMS_PROVIDER=twilio` (SMS + WhatsApp sender), FCM service-account credentials, Paynow USD/ZWG integrations, and restricted Google Maps keys (server key for the API, browser key for the website and dashboards, Android/iOS keys for apps).
* Run background jobs on exactly one API instance (`ENABLE_JOBS=true` there, `false` elsewhere). Socket.IO and the in-memory PIN attempt limiter assume a single instance — add the Socket.IO Redis adapter before scaling out.
* Uploaded images are stored on local disk (`UPLOAD_DIR`) by default; mount a persistent volume, or set `UPLOAD_STORAGE=database` to keep them in PostgreSQL (the Netlify setup does this). ID documents and delivery photos are private and served only to admins, their owner, and (for proof photos) the order's customer.
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
