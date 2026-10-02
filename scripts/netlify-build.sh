#!/usr/bin/env bash
# Netlify build: one site serving
#   /           customer website        (web/customer-web)
#   /vendor/    shop dashboard          (web/vendor-dashboard)
#   /admin/     admin panel             (web/admin-panel)
#   /rider/     rider app               (web/rider-web, prebuilt Flutter web)
#   /api/*      DoorStep API            (backend, Netlify Functions — bundled by Netlify)
# The web apps call the API on the same domain and poll for updates (no sockets
# on serverless). Accounts use passwords until an SMS provider is connected.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/site"

echo "▶ Backend dependencies + Prisma client (for the API functions)"
cd "$ROOT/backend"
npm ci --no-audit --no-fund
npx prisma generate

echo "▶ Web apps"
cd "$ROOT/web"
npm ci --no-audit --no-fund
export STATIC_EXPORT=1
export NEXT_PUBLIC_API_URL=/
export NEXT_PUBLIC_REALTIME=false
export NEXT_PUBLIC_SMS_SIGN_IN="${NEXT_PUBLIC_SMS_SIGN_IN:-false}"
export NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_BASE_PATH= npm run build -w @doorstep/customer-web
NEXT_PUBLIC_BASE_PATH=/vendor npm run build -w @doorstep/vendor-dashboard
NEXT_PUBLIC_BASE_PATH=/admin npm run build -w @doorstep/admin-panel

echo "▶ Assembling $SITE"
rm -rf "$SITE"
mkdir -p "$SITE"
cp -r "$ROOT/web/customer-web/out/." "$SITE/"
cp -r "$ROOT/web/vendor-dashboard/out" "$SITE/vendor"
cp -r "$ROOT/web/admin-panel/out" "$SITE/admin"
# Next.js fetches a base-path app's home page data from "<basePath>.txt" (not "<basePath>/index.txt").
cp "$SITE/vendor/index.txt" "$SITE/vendor.txt"
cp "$SITE/admin/index.txt" "$SITE/admin.txt"
cp -r "$ROOT/web/rider-web" "$SITE/rider"
cp "$ROOT/web/shared/pwa/sw.js" "$SITE/rider/sw.js"

# The rider app loads the Google Maps JavaScript API only when a key is set.
if [ -n "${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:-}" ]; then
  KEY="$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const tag = `<script src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.KEY)}"></script>`;
    const html = fs.readFileSync(file, "utf8");
    if (!html.includes("<!-- GOOGLE_MAPS_SCRIPT")) throw new Error("Maps placeholder missing from rider index.html");
    fs.writeFileSync(file, html.replace(/<!-- GOOGLE_MAPS_SCRIPT[^>]*-->/, tag));
  ' "$SITE/rider/index.html"
  echo "  Google Maps enabled for the rider app"
fi

echo "✔ Site ready: $(du -sh "$SITE" | cut -f1)"
