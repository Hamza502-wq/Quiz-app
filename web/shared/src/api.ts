import { config } from './config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Apps that share one domain (customer site at "/", dashboards under a base
// path) keep separate sessions, so the keys are namespaced by base path.
const KEY_PREFIX = config.basePath ? `ds_${config.basePath.replace(/\W+/g, '')}_` : 'ds_';
const ACCESS_KEY = `${KEY_PREFIX}access_token`;
const REFRESH_KEY = `${KEY_PREFIX}refresh_token`;

export const tokenStore = {
  get access(): string | null {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();
/** Subscribe to "refresh failed, user must log in again". */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshing: Promise<boolean> | null = null;

/** Rotates the refresh token. Concurrent callers share one request. */
export function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return Promise.resolve(false);
  refreshing = (async () => {
    try {
      const res = await fetch(`${config.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        tokenStore.clear();
        sessionExpiredListeners.forEach((l) => l());
        return false;
      }
      const body = (await res.json()) as { accessToken: string; refreshToken: string };
      tokenStore.set(body.accessToken, body.refreshToken);
      return true;
    } catch {
      return false; // network error: keep tokens, let the caller surface the failure
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Send the access token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

/** Base for resolving relative URLs (the API may share this site's domain). */
const pageOrigin = () => (typeof window === 'undefined' ? 'http://localhost' : window.location.origin);

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${config.apiUrl}/api/v1${path}`, pageOrigin());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code = 'ERROR';
  let details: unknown;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string; details?: unknown } };
    if (body.error?.message) message = body.error.message;
    if (body.error?.code) code = body.error.code;
    details = body.error?.details;
    if (Array.isArray(details) && details.length && code === 'VALIDATION_ERROR') {
      const first = details[0] as { path?: string; message?: string };
      if (first.message) message = first.path ? `${first.path}: ${first.message}` : first.message;
    }
  } catch {
    // non-JSON error body
  }
  return new ApiError(res.status, message, code, details);
}

async function send(url: string, init: RequestInit, useAuth: boolean): Promise<Response> {
  const doFetch = () => {
    const headers = new Headers(init.headers);
    const token = tokenStore.access;
    if (useAuth && token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, 'Cannot reach the DoorStep server. Check your connection and try again.', 'NETWORK');
  }
  if (res.status === 401 && useAuth && tokenStore.refresh) {
    if (await refreshTokens()) res = await doFetch();
  }
  return res;
}

/** JSON request against the DoorStep API with automatic token refresh. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(
    buildUrl(path, opts.query),
    {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    },
    opts.auth !== false,
  );
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type UploadKind = 'product' | 'vendor' | 'avatar' | 'document' | 'proof';

export interface UploadResult {
  url: string;
  thumbUrl: string;
  isPrivate: boolean;
}

export async function uploadImage(file: File, kind: UploadKind): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await send(buildUrl('/uploads', { kind }), { method: 'POST', body: form }, true);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as UploadResult;
}

/** Fetches a private (auth-protected) file and returns an object URL. */
export async function fetchPrivateBlobUrl(url: string): Promise<string> {
  // Always ask our own API for the file (the stored link may name another of the site's domains),
  // so the access token is only ever sent to the API.
  const path = privateUploadPath(url);
  if (!path) throw new ApiError(0, 'Not a private upload');
  const res = await send(new URL(`${config.apiUrl}${path}`, pageOrigin()).toString(), { method: 'GET' }, true);
  if (!res.ok) throw await parseError(res);
  return URL.createObjectURL(await res.blob());
}

const PRIVATE_UPLOAD_PREFIX = '/api/v1/uploads/private/';

/** Path of a private upload link (documents, delivery proof), or null for anything else. */
function privateUploadPath(url: string): string | null {
  try {
    const { pathname } = new URL(url, pageOrigin());
    return pathname.startsWith(PRIVATE_UPLOAD_PREFIX) ? pathname : null;
  } catch {
    return null;
  }
}

/** True for private uploads (documents, delivery proof), which need the access token to load. */
export function isPrivateUpload(url: string): boolean {
  return privateUploadPath(url) !== null;
}
