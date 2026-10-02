import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { drainBackgroundTasks } from './lib/background';

/**
 * Runs the Express app inside a serverless function that speaks the Web
 * Request/Response API (Netlify Functions). Each function instance starts the
 * app on a private loopback port once and forwards requests to it, so Express
 * and its middleware run exactly as on a normal server. Socket.IO is not
 * available there; the apps fall back to polling the REST API.
 *
 * The app must trust one proxy hop (TRUST_PROXY=1) so `req.ip` is the
 * visitor's address passed in X-Forwarded-For, which is always overwritten here.
 */
// Kept on globalThis so a re-loaded module reuses the running server.
const state = globalThis as unknown as { doorstepServer?: Promise<string> | null };

function startServer(): Promise<string> {
  state.doorstepServer ??= new Promise<string>((resolve, reject) => {
    const server = http.createServer(createApp());
    server.on('error', (err) => {
      state.doorstepServer = null;
      reject(err);
    });
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
  return state.doorstepServer;
}

// Headers the platform recomputes for the new body, or that fetch already decoded.
const DROPPED_RESPONSE_HEADERS = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive']);
const DROPPED_REQUEST_HEADERS = ['host', 'connection', 'content-length', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'];

export async function handleRequest(request: Request, clientIp?: string): Promise<Response> {
  const base = await startServer();
  const url = new URL(request.url);

  const headers = new Headers(request.headers);
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name);
  headers.set('x-forwarded-for', clientIp || '0.0.0.0');
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  headers.set('x-forwarded-host', url.host);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(`${base}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const body = await upstream.arrayBuffer();
  // Finish notifications and dispatch before the platform freezes the process.
  await drainBackgroundTasks();

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key !== 'set-cookie' && !DROPPED_RESPONSE_HEADERS.has(key)) out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);

  const noBody = request.method === 'HEAD' || upstream.status === 204 || upstream.status === 304;
  return new Response(noBody ? null : body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
