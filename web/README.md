# DoorStep web dashboards

npm workspace with two Next.js 16 (App Router, TypeScript, Tailwind 4) apps and a shared package.

| Workspace | Port | Description |
| --- | --- | --- |
| `vendor-dashboard` | 3000 | Store owners: onboarding, profile & hours, menu & stock, live orders, reports, payouts |
| `admin-panel` | 3001 | Operations: analytics, live map & dispatch, approvals, disputes & refunds, payouts, settings & zones |
| `shared` | — | `@doorstep/web-shared`: API client with token refresh, auth context, Socket.IO provider, Google Maps helpers, UI kit, types |

```bash
npm install
cp vendor-dashboard/.env.example vendor-dashboard/.env.local
cp admin-panel/.env.example admin-panel/.env.local
npm run dev:vendor
npm run dev:admin
npm run build          # production build of both apps (includes type checking)
```

Set `NEXT_PUBLIC_API_URL` to the API origin and add it to the API's `CORS_ORIGINS`. Maps need `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (and a Map ID for advanced markers; `DEMO_MAP_ID` works in development). Without a key, maps are replaced by coordinate inputs.

Docker: `docker build --build-arg APP=vendor-dashboard --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t doorstep-vendor .`
