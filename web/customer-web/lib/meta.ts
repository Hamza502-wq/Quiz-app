'use client';

import { useEffect, useState } from 'react';
import { api } from '@doorstep/web-shared';

/** What this deployment supports (GET /meta). */
export interface Meta {
  paymentsSimulated: boolean;
  smsSignIn: boolean;
}

let cached: Promise<Meta | null> | null = null;

/** Loaded once per page load; null until known (or if the API is unreachable). */
export function useMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    cached ??= api<Meta>('/meta', { auth: false }).catch(() => {
      cached = null; // try again on the next screen
      return null;
    });
    let alive = true;
    void cached.then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}
