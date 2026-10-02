# DoorStep web apps

npm workspace with three Next.js 16 (App Router, TypeScript, Tailwind 4) apps and a shared package.

| Workspace | Port | Description |
| --- | --- | --- |
| `customer-web` | 3002 | Public website for customers: browse stores, order, pay, track deliveries live, send parcels, manage account and addresses |
| `vendor-dashboard` | 3000 | Store owners: onboarding, profile & hours, menu & stock, live orders, reports, payouts |
| `admin-panel` | 3001 | Operations: analytics, live map & dispatch, approvals, disputes & refunds, payouts, settings & zones |
| `shared` | — | `@doorstep/web-shared`: API client with token refresh, auth context, Socket.IO provider, Google Maps helpers, UI kit, types |

```bash
npm install
cp customer-web/.env.example customer-web/.env.local
cp vendor-dashboard/.env.example vendor-dashboard/.env.local
cp admin-panel/.env.example admin-panel/.env.local
npm run dev:customer
npm run dev:vendor
npm run dev:admin
npm run build          # production build of all three apps (includes type checking)
```

Set `NEXT_PUBLIC_API_URL` to the API origin and add each app's origin to the API's `CORS_ORIGINS` (the defaults cover ports 3000–3002). Maps need `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (and a Map ID for advanced markers; `DEMO_MAP_ID` works in development). Without a key, maps are replaced by coordinate inputs (the website also offers "Use my location" and hides the tracking map, keeping status and ETA).

### One site for everything (Netlify)

[`scripts/netlify-build.sh`](../scripts/netlify-build.sh) builds the three apps as static files and serves them from one domain: the customer website at `/`, the shop dashboard at `/vendor/` and the admin panel at `/admin/` (each built with `STATIC_EXPORT=1` and `NEXT_PUBLIC_BASE_PATH`), with the API on the same domain (`NEXT_PUBLIC_API_URL=/`). On that host:
* `NEXT_PUBLIC_REALTIME=false`: no Socket.IO; screens poll the API instead (orders board every 6 s, tracking every 6 s, chat every 4 s).
* `NEXT_PUBLIC_SMS_SIGN_IN=false`: sign-in and sign-up use passwords (the shared `LoginPage` adds a "Create an account" form).
* Sessions are kept per app (`localStorage` keys are namespaced by base path), so signing in to the admin panel doesn't sign you out of the shop.
* Each app is installable on phones (web app manifest, icons and a small service worker from `shared/pwa`, copied into `public/` before every build), with an "Install the app" button.

Detail pages that used dynamic routes take the id as a query parameter instead (e.g. `/admin/orders/view?id=…`), so every page can be exported.

`NEXT_PUBLIC_CUSTOMER_URL`, `NEXT_PUBLIC_VENDOR_URL` and `NEXT_PUBLIC_RIDER_URL` set where the "Sell on DoorStep" / "Ride with DoorStep" links go when the apps run on separate addresses (docker-compose sets them; `NEXT_PUBLIC_RIDER_URL=none` hides the rider links).

### Customer website demo (no backend)

`npm run build:demo -w @doorstep/customer-web` exports the website as plain static files in `customer-web/out`, running on an in-browser demo API: the sample stores from the seed, any Zimbabwe mobile number with code `123456`, and orders that move through the real statuses on a timer (about 80 seconds to delivery). Nothing leaves the browser and a banner marks it as a demo. Drag the `out` folder onto Netlify Drop to publish it. `npm run dev:demo -w @doorstep/customer-web` runs the same demo locally.

Docker: `docker build --build-arg APP=vendor-dashboard --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t doorstep-vendor .`
