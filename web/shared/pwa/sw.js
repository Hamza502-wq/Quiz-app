/*
 * DoorStep service worker (installable app + offline fallback).
 * One copy is served by each app at <basePath>/sw.js; its scope is that app's
 * base path. The API, uploads and the other apps on the same domain are never
 * cached or intercepted. Generated from web/shared/pwa/sw.js — edit it there.
 */
const SCOPE_PATH = new URL(self.registration.scope).pathname; // "/" or "/vendor/"
// Caches are shared by every app on the domain, so names include the scope.
const CACHE_PREFIX = `doorstep:${SCOPE_PATH}:`;
const CACHE = `${CACHE_PREFIX}v1`;
const OTHER_APPS = ['/vendor/', '/admin/', '/rider/'].filter((p) => p !== SCOPE_PATH);
const NEVER_HANDLE = ['/api/', '/uploads/', '/health', '/.netlify/', ...OTHER_APPS];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>You're offline · DoorStep</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Poppins,system-ui,sans-serif;background:#F7F7F8;color:#1A1A1A;text-align:center;padding:24px}
h1{font-size:22px;margin:0 0 8px}p{color:#6B6B6B;margin:0 0 20px}button{background:#FF7A00;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:600;font-size:15px}</style>
</head><body><main><h1>You're offline</h1><p>Check your internet connection and try again.</p>
<button onclick="location.reload()">Try again</button></main></body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // maps, photos, fonts from other sites
  if (NEVER_HANDLE.some((p) => url.pathname === p.replace(/\/$/, '') || url.pathname.startsWith(p))) return;
  if (!url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === 'navigate') {
    // Pages: always try the network first so customers see fresh data.
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          return cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  if (url.pathname.includes('/_next/static/')) {
    // Build assets have content hashes in their names: cache forever.
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
