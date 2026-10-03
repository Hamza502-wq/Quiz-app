#!/usr/bin/env bash
# Builds the rider app for the web and refreshes the prebuilt copy in
# web/rider-web/, which the Netlify site serves at /rider/. Run it after
# changing apps/rider_app or packages/doorstep_core, then commit web/rider-web.
#
# The Netlify build has no Flutter SDK, so the compiled app is kept in the repo.
# CanvasKit (Flutter's web renderer) is loaded from Google's CDN, so it isn't copied.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/rider_app"

flutter pub get
flutter build web --release --base-href /rider/ \
  --dart-define=REALTIME=false \
  --dart-define=SMS_SIGN_IN=false

OUT="$ROOT/web/rider-web"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r build/web/. "$OUT/"
rm -rf "$OUT/canvaskit" "$OUT/flutter_service_worker.js" "$OUT/.last_build_id"
echo "Rider web app written to web/rider-web ($(du -sh "$OUT" | cut -f1))"
