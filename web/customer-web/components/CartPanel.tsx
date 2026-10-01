'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquarePlus, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button, Input, cn, formatMoney } from '@doorstep/web-shared';
import { MAX_QUANTITY, useCart, type CartLine } from '@/lib/cart';
import { storeHref } from '@/lib/routes';

/** Cart contents with quantity steppers and per-item notes. */
export function CartPanel({
  minOrderCents,
  blockedReason,
  className,
  compact,
}: {
  /** Store minimum, when known (store page / cart page after loading the store). */
  minOrderCents?: number;
  /** Why the order can't go ahead right now (store closed, too far away…). */
  blockedReason?: string;
  className?: string;
  /** Sidebar layout on the store page. */
  compact?: boolean;
}) {
  const cart = useCart();

  if (!cart.ready) return null;
  if (cart.lines.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-8 text-center', className)}>
        <ShoppingBag className="h-8 w-8 text-brand" aria-hidden />
        <p className="font-semibold">Your cart is empty</p>
        <p className="text-sm text-muted">Add items from a store to start an order.</p>
      </div>
    );
  }

  const belowMinimum = minOrderCents !== undefined && cart.subtotalCents < minOrderCents;

  return (
    <div className={cn('rounded-2xl border border-line bg-white shadow-card', className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Your order from</p>
          {cart.vendorSlug ? (
            <Link href={storeHref(cart.vendorSlug)} className="block truncate font-bold hover:text-brand">
              {cart.vendorName}
            </Link>
          ) : (
            <p className="truncate font-bold">{cart.vendorName}</p>
          )}
        </div>
        <button type="button" onClick={cart.clear} className="text-xs font-semibold text-muted hover:text-alert">
          Clear
        </button>
      </div>
      <ul className={cn('divide-y divide-line overflow-y-auto', compact && 'max-h-[45vh]')}>
        {cart.lines.map((line) => (
          <CartLineRow key={line.productId} line={line} />
        ))}
      </ul>
      <div className="space-y-3 border-t border-line px-4 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="font-bold">{formatMoney(cart.subtotalCents)}</span>
        </div>
        <p className="text-xs text-muted">Delivery fee and tip are added at checkout.</p>
        {belowMinimum ? (
          <p className="rounded-xl bg-warning-light px-3 py-2 text-xs font-medium text-warning">
            This store&apos;s minimum order is {formatMoney(minOrderCents!)}. Add {formatMoney(minOrderCents! - cart.subtotalCents)} more.
          </p>
        ) : null}
        {blockedReason ? <p className="rounded-xl bg-alert-light px-3 py-2 text-xs font-medium text-alert">{blockedReason}</p> : null}
        {belowMinimum || blockedReason ? (
          <Button size="lg" className="w-full" disabled>
            Go to checkout
          </Button>
        ) : (
          <Link
            href="/checkout"
            className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-base font-semibold text-white shadow-sm hover:bg-brand-dark"
          >
            Go to checkout
          </Link>
        )}
      </div>
    </div>
  );
}

function CartLineRow({ line }: { line: CartLine }) {
  const { setQuantity, setNotes } = useCart();
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState(line.notes ?? '');

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{line.name}</p>
          <p className="text-xs text-muted">{formatMoney(line.priceCents)} each</p>
          {line.notes && !editingNotes ? <p className="mt-1 text-xs italic text-ink-soft">“{line.notes}”</p> : null}
        </div>
        <p className="text-sm font-semibold">{formatMoney(line.priceCents * line.quantity)}</p>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setQuantity(line.productId, line.quantity - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-l-xl hover:bg-canvas"
            aria-label={line.quantity === 1 ? `Remove ${line.name}` : `One less ${line.name}`}
          >
            {line.quantity === 1 ? <Trash2 className="h-4 w-4 text-alert" /> : <Minus className="h-4 w-4" />}
          </button>
          <span className="w-8 text-center text-sm font-semibold" aria-label="Quantity">
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(line.productId, line.quantity + 1)}
            disabled={line.quantity >= MAX_QUANTITY}
            className="flex h-8 w-8 items-center justify-center rounded-r-xl hover:bg-canvas disabled:opacity-40"
            aria-label={`One more ${line.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(line.notes ?? '');
            setEditingNotes((v) => !v);
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
          {line.notes ? 'Edit note' : 'Add note'}
        </button>
      </div>
      {editingNotes ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setNotes(line.productId, draft);
            setEditingNotes(false);
          }}
        >
          <Input autoFocus value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. no onions, extra gravy" className="py-1.5" />
          <Button type="submit" size="sm" className="h-auto">
            Save
          </Button>
        </form>
      ) : null}
    </li>
  );
}
