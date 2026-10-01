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

### Customer website demo (Netlify)

`npm run build:demo -w @doorstep/customer-web` exports the website as plain static files in `customer-web/out`, running on an in-browser demo API: the sample stores from the seed, any Zimbabwe mobile number with code `123456`, and orders that move through the real statuses on a timer (about 80 seconds to delivery). Nothing leaves the browser and a banner marks it as a demo. The repository's [`netlify.toml`](../netlify.toml) builds this, so connecting the repo in Netlify (or dragging the `out` folder onto Netlify Drop) publishes it. `npm run dev:demo -w @doorstep/customer-web` runs the same demo locally.

Docker: `docker build --build-arg APP=vendor-dashboard --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t doorstep-vendor .`
