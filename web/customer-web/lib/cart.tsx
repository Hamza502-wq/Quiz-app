'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

export const MAX_QUANTITY = 99;
const STORAGE_KEY = 'ds_web_cart';

export interface CartLine {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  thumbUrl: string | null;
  notes: string | null;
}

interface CartState {
  vendorId: string | null;
  vendorName: string | null;
  vendorSlug: string | null;
  lines: CartLine[];
}

const EMPTY: CartState = { vendorId: null, vendorName: null, vendorSlug: null, lines: [] };

export interface CartVendor {
  id: string;
  name: string;
  slug: string;
}

interface CartContextValue extends CartState {
  /** False until the saved cart has been read, so pages don't flash "empty". */
  ready: boolean;
  itemCount: number;
  subtotalCents: number;
  quantityOf: (productId: string) => number;
  /** True when adding from `vendorId` would replace a cart from another store. */
  conflictsWith: (vendorId: string) => boolean;
  add: (vendor: CartVendor, item: Omit<CartLine, 'quantity' | 'notes'>, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setNotes: (productId: string, notes: string) => void;
  /** Replaces the cart (used by "Order again"). */
  replace: (vendor: CartVendor, lines: CartLine[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function isValidState(value: unknown): value is CartState {
  if (!value || typeof value !== 'object') return false;
  const v = value as CartState;
  return (
    Array.isArray(v.lines) &&
    v.lines.every(
      (l) => typeof l?.productId === 'string' && typeof l.name === 'string' && Number.isInteger(l.priceCents) && Number.isInteger(l.quantity),
    )
  );
}

/** Single-store cart persisted in localStorage (same rules as the mobile app). */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readJson<unknown>(STORAGE_KEY);
    if (isValidState(saved) && saved.lines.length > 0) setState(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeJson(STORAGE_KEY, state.lines.length ? state : null);
  }, [state, ready]);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readJson<unknown>(STORAGE_KEY);
      setState(isValidState(next) ? next : EMPTY);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback<CartContextValue['add']>((vendor, item, quantity = 1) => {
    setState((prev) => {
      const base = prev.vendorId && prev.vendorId !== vendor.id ? EMPTY : prev;
      const existing = base.lines.find((l) => l.productId === item.productId);
      const lines = existing
        ? base.lines.map((l) =>
            l.productId === item.productId ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l,
          )
        : [...base.lines, { ...item, quantity: Math.max(1, Math.min(MAX_QUANTITY, quantity)), notes: null }];
      return { vendorId: vendor.id, vendorName: vendor.name, vendorSlug: vendor.slug, lines };
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setState((prev) => {
      const lines =
        quantity <= 0
          ? prev.lines.filter((l) => l.productId !== productId)
          : prev.lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l));
      return lines.length ? { ...prev, lines } : EMPTY;
    });
  }, []);

  const setNotes = useCallback((productId: string, notes: string) => {
    const trimmed = notes.trim().slice(0, 200);
    setState((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.productId === productId ? { ...l, notes: trimmed || null } : l)),
    }));
  }, []);

  const replace = useCallback((vendor: CartVendor, lines: CartLine[]) => {
    setState(lines.length ? { vendorId: vendor.id, vendorName: vendor.name, vendorSlug: vendor.slug, lines } : EMPTY);
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      ready,
      itemCount: state.lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotalCents: state.lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),
      quantityOf: (productId) => state.lines.find((l) => l.productId === productId)?.quantity ?? 0,
      conflictsWith: (vendorId) => Boolean(state.vendorId && state.vendorId !== vendorId && state.lines.length),
      add,
      setQuantity,
      setNotes,
      replace,
      clear,
    }),
    [state, ready, add, setQuantity, setNotes, replace, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
