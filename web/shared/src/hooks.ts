'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Query } from './api';

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Fetches `path` (GET) and re-fetches when `path`/`query` change. Pass `null` to skip.
 * Keeps the previous data while reloading so screens don't flash.
 */
export function useApi<T>(path: string | null, query?: Query): ApiState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const queryKey = JSON.stringify(query ?? {});
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { query: JSON.parse(queryKey) as Query });
      if (id === requestId.current) setDataState(result);
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong'));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater));
  }, []);

  return { data, error, loading, reload: load, setData };
}

/** Wraps an async action with pending state; errors are returned for display. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, setError };
}

export function useInterval(callback: () => void, ms: number | null): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
