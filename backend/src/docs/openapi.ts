import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { env } from '../config/env';
import { openApiRegistry } from '../lib/route';

let cached: ReturnType<OpenApiGeneratorV3['generateDocument']> | null = null;

export function buildOpenApiDocument() {
  if (cached) return cached;
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
  cached = generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'DoorStep Zimbabwe API',
      version: '1.0.0',
      description: [
        'REST API for the DoorStep Zimbabwe on-demand delivery platform (customer app, rider app, vendor dashboard and admin panel).',
        '',
        '**Auth:** request an SMS code with `POST /auth/otp/request`, then `POST /auth/otp/verify` to receive a short-lived JWT access token and a rotating refresh token. Send `Authorization: Bearer <token>`.',
        '',
        '**Money:** all `*Cents` amounts are US-dollar cents. ZiG values are derived from the order `exchangeRate` (ZWG per USD). `totalLocalCents` is in the order currency.',
        '',
        '**Real-time:** connect Socket.IO to the API origin with `auth: { token }`. Events: `order:updated`, `order:rider_location`, `dispatch:offer`, `dispatch:offer_cancelled`, `vendor:new_order`, `chat:message`, `notification`, `rider:location` (admins). Emit `order:subscribe {orderId}` to follow an order and `rider:location {lat,lng,heading}` from the rider app.',
        '',
        '**Errors:** `{ "error": { "code": "…", "message": "…", "details"?: … } }`',
      ].join('\n'),
    },
    servers: [{ url: env.PUBLIC_BASE_URL }],
  });
  return cached;
}
