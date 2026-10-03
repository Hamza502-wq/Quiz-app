'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button, Field, InlineError, Input, LoadingBlock, Modal, Textarea, api, cn, useApi } from '@doorstep/web-shared';
import { ListingThumb } from './ListingCard';
import { centsToDollars, dollarsToCents, priceLabel, usd, type ListingSummary, type Offer } from '@/lib/market';

const MAX_ITEMS = 5;

/**
 * Make a swap offer for a listing, or answer an offer with a counter offer. Either way it is
 * a choice of the buyer's items (1–5) plus optional cash from the buyer.
 */
export function OfferModal({
  open,
  onClose,
  onDone,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (offer: Offer) => void;
  mode: { type: 'create'; listingId: string; listingTitle: string } | { type: 'counter'; offer: Offer };
}) {
  const itemsPath = mode.type === 'create' ? '/market/me/swappable' : `/market/offers/${mode.offer.id}/buyer-items`;
  const items = useApi<ListingSummary[]>(open ? itemsPath : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [cash, setCash] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A counter starts from the offer being answered.
  const counterOf = mode.type === 'counter' ? mode.offer : null;
  const counterId = counterOf?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setSelected(counterOf ? counterOf.items.map((i) => i.id) : []);
    setCash(counterOf && counterOf.cashCents > 0 ? centsToDollars(counterOf.cashCents) : '');
    setMessage('');
    setError(null);
    // Reset only when the modal opens or answers a different offer (`mode` is rebuilt on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, counterId]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_ITEMS ? prev : [...prev, id]));

  const submit = async () => {
    setError(null);
    if (selected.length === 0) return setError(mode.type === 'create' ? 'Choose at least one of your items to offer.' : 'Choose at least one of the buyer’s items.');
    const cashCents = cash.trim() ? dollarsToCents(cash) : 0;
    if (cashCents === null) return setError('Enter the cash amount in US dollars, e.g. 20 or 15.50.');
    setSaving(true);
    try {
      const body = { itemIds: selected, cashCents, message: message.trim() || undefined };
      const offer =
        mode.type === 'create'
          ? await api<Offer>(`/market/listings/${mode.listingId}/offers`, { body })
          : await api<Offer>(`/market/offers/${mode.offer.id}/counter`, { body });
      onDone(offer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The offer was not sent.');
    } finally {
      setSaving(false);
    }
  };

  const title = mode.type === 'create' ? 'Offer a swap' : 'Counter offer';
  const intro =
    mode.type === 'create'
      ? `Choose up to ${MAX_ITEMS} of your items to offer for “${mode.listingTitle}”. You can add cash on top.`
      : counterOf?.role === 'seller'
        ? `Choose which of ${counterOf.buyerName}’s items you want for “${counterOf.listing.title}”, and any cash they should add.`
        : `Change which of your items you offer for “${counterOf?.listing.title}”, and any cash you add.`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!items.data || items.data.length === 0}>
            {mode.type === 'create' ? 'Send offer' : 'Send counter offer'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{intro}</p>
      <div className="mt-4">
        {items.error && !items.data ? (
          <InlineError message={items.error.message} />
        ) : !items.data ? (
          <LoadingBlock label="Loading items…" variant="list" />
        ) : items.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm">
            {mode.type === 'create' ? (
              <>
                <p className="font-semibold">You have nothing listed to swap yet.</p>
                <p className="mt-1 text-muted">List the item you want to give, then come back to offer it.</p>
                <Link href="/market/sell?new=1" className="mt-3 inline-block font-semibold text-brand hover:underline">
                  List an item
                </Link>
              </>
            ) : (
              <p className="text-muted">The buyer has no other items listed right now.</p>
            )}
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Items to swap">
            {items.data.map((l) => {
              const on = selected.includes(l.id);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => toggle(l.id)}
                    aria-pressed={on}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors',
                      on ? 'border-brand bg-brand-light' : 'border-line bg-white hover:border-brand',
                    )}
                  >
                    <ListingThumb listing={l} className="h-14 w-14 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{l.title}</span>
                      <span className="block text-xs text-muted">Listed at {priceLabel(l)}</span>
                    </span>
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                        on ? 'border-brand bg-brand text-white' : 'border-line',
                      )}
                      aria-hidden
                    >
                      {on ? <Check className="h-4 w-4" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.data && items.data.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            {selected.length} of up to {MAX_ITEMS} chosen
            {selected.length > 0
              ? ` · listed value ${usd(items.data.filter((l) => selected.includes(l.id)).reduce((n, l) => n + l.priceCents, 0))}`
              : ''}
          </p>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Cash on top (optional)" hint="US dollars the buyer adds to the items">
          <Input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" maxLength={12} />
        </Field>
        <Field label="Message (optional)">
          <Textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything the other side should know" />
        </Field>
      </div>
      <div className="mt-3">
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
